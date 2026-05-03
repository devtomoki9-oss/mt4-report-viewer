//+------------------------------------------------------------------+
//|  MT4ReportExporter.mq4                                           |
//|  取引履歴を JSON に自動エクスポートする EA                        |
//|                                                                  |
//|  【特徴】                                                        |
//|  ・自動売買（Auto Trading）が OFF でも動作します                  |
//|  ・注文・決済などの売買操作は一切行いません                      |
//|  ・ファイル書き出しのみ実行します                                |
//|  ・ブラウザの「更新」ボタンで即時エクスポートに対応              |
//|                                                                  |
//|  【設置方法】                                                    |
//|  1. MQL4\Experts\ フォルダにコピー                               |
//|  2. MT4_Exporter.bat で MT4 を起動                               |
//|  3. ダイアログで OK を押す（自動売買許可は不要）                 |
//|                                                                  |
//|  【出力先】                                                      |
//|  %USERPROFILE%\MTExport\                                        |
//|  <口座番号>.json                                                 |
//+------------------------------------------------------------------+
#property copyright ""
#property link      ""
#property version   "1.80"
#property strict
#property description "取引履歴を JSON へ自動エクスポートします。自動売買 OFF でも動作します。"

#import "kernel32.dll"
   int  GetEnvironmentVariableW(string name, ushort &buf[], int bufSize);
   int  CreateDirectoryW(string path, int sec);
   int  CreateFileW(string path, uint access, uint share, int sec,
                    uint disp, uint flags, int tmpl);
   bool WriteFile(int hFile, uchar &buf[], uint toWrite, uint &written[], int overlapped);
   bool CloseHandle(int hFile);
   bool DeleteFileW(string path);
#import

#define GENERIC_WRITE         0x40000000
#define GENERIC_READ          0x80000000
#define CREATE_ALWAYS         2
#define OPEN_EXISTING         3
#define FILE_ATTRIBUTE_NORMAL 0x80
#define FILE_SHARE_READ       1

input int    RefreshMinutes  = 1;            // 定期エクスポート間隔（分）
input int    RealtimeSec     = 10;           // Tick 発生時の最小エクスポート間隔（秒）
input string ExportSubFolder = "MTExport";  // USERPROFILE 直下のサブフォルダ名
input int    ChartBars       = 100;          // 時間足ごとの出力本数（最大500）

#define TIMER_SEC 5

int      g_ExportTick         = 0;
datetime g_LastTriggerExport  = 0;
datetime g_LastRealtimeExport = 0;
bool     g_LastAutoTrading    = false;

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(TIMER_SEC);
   g_LastAutoTrading = (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED);
   ExportTrades();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTick()
{
   datetime now = TimeCurrent();
   int sec = MathMax(RealtimeSec, 5);
   if (now - g_LastRealtimeExport >= sec)
   {
      g_LastRealtimeExport = now;
      g_ExportTick = 0;
      ExportTrades();
   }
}

void OnTimer()
{
   bool triggered = CheckTrigger();

   bool currentAT = (bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED);
   bool atChanged  = (currentAT != g_LastAutoTrading);
   g_LastAutoTrading = currentAT;

   g_ExportTick++;
   if (triggered || atChanged || g_ExportTick >= (RefreshMinutes * 60 / TIMER_SEC))
   {
      g_ExportTick = 0;
      ExportTrades();
   }
}

//+------------------------------------------------------------------+
bool CheckTrigger()
{
   string triggerPath = GetExportDir() + "\\_refresh.cmd";
   int h = CreateFileW(triggerPath, GENERIC_READ, FILE_SHARE_READ, 0,
                       OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return false;
   CloseHandle(h);

   datetime now = TimeCurrent();
   if (now - g_LastTriggerExport < 30) return false;
   g_LastTriggerExport = now;
   return true;
}

//+------------------------------------------------------------------+
string GetExportDir()
{
   ushort buf[260];
   int len = GetEnvironmentVariableW("USERPROFILE", buf, 260);
   if (len <= 0) return "";
   return ShortArrayToString(buf, 0, len) + "\\" + ExportSubFolder;
}

bool WriteStringToFile(string filepath, string content)
{
   uchar buf[];
   int len = StringToCharArray(content, buf, 0, StringLen(content));
   if (len <= 0) return false;

   uint written[1];
   int hFile = CreateFileW(filepath, GENERIC_WRITE, 0, 0, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, 0);
   if (hFile == -1) return false;

   bool ok = WriteFile(hFile, buf, (uint)len, written, 0);
   CloseHandle(hFile);
   return ok;
}

//+------------------------------------------------------------------+
//|  保有ポジションのシンボルを収集（重複排除）                       |
//+------------------------------------------------------------------+
int CollectPositionSymbols(string &symbols[])
{
   int count = 0;
   int openTotal = OrdersTotal();
   for (int i = 0; i < openTotal; i++)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderType() > OP_SELL) continue;
      string sym = OrderSymbol();
      bool found = false;
      for (int j = 0; j < count; j++) if (symbols[j] == sym) { found = true; break; }
      if (!found) { ArrayResize(symbols, count + 1); symbols[count++] = sym; }
   }
   if (count == 0)
   {
      ArrayResize(symbols, 1);
      symbols[0] = Symbol();
      count = 1;
   }
   return count;
}

//+------------------------------------------------------------------+
//|  取引履歴を JSON ファイルに書き出す                              |
//+------------------------------------------------------------------+
void ExportTrades()
{
   string exportDir = GetExportDir();
   if (exportDir == "")
   {
      Print("[MTExporter] USERPROFILE が取得できません");
      return;
   }

   CreateDirectoryW(exportDir, 0);

   string filepath = exportDir + "\\" + IntegerToString(AccountNumber()) + ".json";

   string json = "{\n";
   json += "  \"account\": "     + IntegerToString(AccountNumber())     + ",\n";
   json += "  \"name\": \""      + EscapeJson(AccountName())            + "\",\n";
   json += "  \"server\": \""    + EscapeJson(AccountServer())          + "\",\n";
   json += "  \"currency\": \""  + AccountCurrency()                    + "\",\n";
   json += "  \"balance\": "     + DoubleToString(AccountBalance(), 2)  + ",\n";
   json += "  \"equity\": "      + DoubleToString(AccountEquity(),  2)  + ",\n";
   json += "  \"credit\": "      + DoubleToString(AccountCredit(),  2)  + ",\n";
   json += "  \"leverage\": "    + IntegerToString(AccountLeverage())   + ",\n";
   json += "  \"exportTime\": \""+ TimeToISO(TimeCurrent())             + "\",\n";
   json += "  \"autoTrading\": " + ((bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ? "true" : "false") + ",\n";
   json += "  \"trades\": [\n";

   int total = OrdersHistoryTotal();
   bool first = true;

   for (int i = 0; i < total; i++)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if (OrderType() > OP_SELL) continue;

      if (!first) json += ",\n";
      first = false;

      string typeStr    = (OrderType() == OP_BUY) ? "buy" : "sell";
      double profit     = OrderProfit();
      double swap       = OrderSwap();
      double commission = OrderCommission();

      json += "    {";
      json += "\"ticket\":"      + IntegerToString(OrderTicket())             + ",";
      json += "\"openTime\":\""  + TimeToISO(OrderOpenTime())                 + "\",";
      json += "\"closeTime\":\"" + TimeToISO(OrderCloseTime())                + "\",";
      json += "\"type\":\""      + typeStr                                    + "\",";
      json += "\"size\":"        + DoubleToString(OrderLots(),       2)       + ",";
      json += "\"symbol\":\""    + OrderSymbol()                              + "\",";
      json += "\"openPrice\":"   + DoubleToString(OrderOpenPrice(),  5)       + ",";
      json += "\"closePrice\":"  + DoubleToString(OrderClosePrice(), 5)       + ",";
      json += "\"sl\":"          + DoubleToString(OrderStopLoss(),   5)       + ",";
      json += "\"tp\":"          + DoubleToString(OrderTakeProfit(), 5)       + ",";
      json += "\"commission\":"  + DoubleToString(commission,        2)       + ",";
      json += "\"swap\":"        + DoubleToString(swap,              2)       + ",";
      json += "\"profit\":"      + DoubleToString(profit,            2)       + ",";
      json += "\"netProfit\":"   + DoubleToString(profit+swap+commission, 2)  + ",";
      json += "\"comment\":\""   + EscapeJson(OrderComment())                 + "\"";
      json += "}";
   }

   json += "\n  ],\n";
   json += "  \"positions\": [\n";

   int openTotal = OrdersTotal();
   bool firstPos = true;
   for (int i = 0; i < openTotal; i++)
   {
      if (!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if (OrderType() > OP_SELL) continue;

      if (!firstPos) json += ",\n";
      firstPos = false;

      string posType = (OrderType() == OP_BUY) ? "buy" : "sell";
      json += "    {";
      json += "\"ticket\":"       + IntegerToString(OrderTicket())             + ",";
      json += "\"openTime\":\""   + TimeToISO(OrderOpenTime())                 + "\",";
      json += "\"type\":\""       + posType                                    + "\",";
      json += "\"size\":"         + DoubleToString(OrderLots(),       2)       + ",";
      json += "\"symbol\":\""     + OrderSymbol()                              + "\",";
      json += "\"openPrice\":"    + DoubleToString(OrderOpenPrice(),  5)       + ",";
      json += "\"currentPrice\":" + DoubleToString(OrderClosePrice(), 5)       + ",";
      json += "\"sl\":"           + DoubleToString(OrderStopLoss(),   5)       + ",";
      json += "\"tp\":"           + DoubleToString(OrderTakeProfit(), 5)       + ",";
      json += "\"profit\":"       + DoubleToString(OrderProfit(),     2)       + ",";
      json += "\"swap\":"         + DoubleToString(OrderSwap(),       2)       + ",";
      json += "\"comment\":\""    + EscapeJson(OrderComment())                 + "\"";
      json += "}";
   }

   // チャートデータ（保有ポジションのシンボル × 6時間足）
   json += "\n  ],\n";
   json += "  \"charts\": {\n";

   string symbols[];
   int symCount = CollectPositionSymbols(symbols);
   int bars = MathMax(1, MathMin(ChartBars, 500));
   int tfs[6];
   tfs[0]=1; tfs[1]=5; tfs[2]=15; tfs[3]=60; tfs[4]=240; tfs[5]=1440;

   for (int si = 0; si < symCount; si++)
   {
      if (si > 0) json += ",\n";
      string sym    = symbols[si];
      int    digits = (int)MarketInfo(sym, MODE_DIGITS);

      json += "    \"" + sym + "\": {\n";

      for (int ti = 0; ti < 6; ti++)
      {
         int tf = tfs[ti];
         if (ti > 0) json += ",\n";
         json += "      \"" + IntegerToString(tf) + "\": {\"candles\":[\n";

         bool firstBar = true;
         for (int i = bars - 1; i >= 0; i--)
         {
            datetime t = iTime(sym, tf, i);
            if (t == 0) continue;
            double o = iOpen(sym,  tf, i);
            double h = iHigh(sym,  tf, i);
            double l = iLow(sym,   tf, i);
            double c = iClose(sym, tf, i);
            if (!firstBar) json += ",\n";
            firstBar = false;
            json += "        {\"t\":\"" + TimeToISO(t) + "\","
                  + "\"o\":" + DoubleToString(o, digits) + ","
                  + "\"h\":" + DoubleToString(h, digits) + ","
                  + "\"l\":" + DoubleToString(l, digits) + ","
                  + "\"c\":" + DoubleToString(c, digits) + "}";
         }
         json += "\n      ]}";
      }
      json += "\n    }";
   }

   json += "\n  }\n}\n";

   if (WriteStringToFile(filepath, json))
      Print("[MTExporter] エクスポート完了: ", filepath, "  (", total, " 件, ", openTotal, " positions, ", symCount, " symbols x6TF)");
   else
      Print("[MTExporter] 書き込み失敗: ", filepath, "  エラー: ", GetLastError());
}

//+------------------------------------------------------------------+
string EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}

string TimeToISO(datetime t)
{
   if (t == 0) return "";
   return TimeToString(t, TIME_DATE | TIME_SECONDS);
}
