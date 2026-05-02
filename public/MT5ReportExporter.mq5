//+------------------------------------------------------------------+
//|  MT5ReportExporter.mq5                                           |
//|  取引履歴を JSON に自動エクスポートする EA (MT5版)                |
//|                                                                  |
//|  【特徴】                                                        |
//|  ・自動売買（Auto Trading）が OFF でも動作します                  |
//|  ・注文・決済などの売買操作は一切行いません                      |
//|  ・ファイル書き出しのみ実行します                                |
//|  ・ブラウザの「更新」ボタンで即時エクスポートに対応              |
//|                                                                  |
//|  【出力先】                                                      |
//|  %USERPROFILE%\MTExport\                                        |
//|  <口座番号>.json                                                 |
//+------------------------------------------------------------------+
#property copyright ""
#property link      ""
#property version   "1.20"
#property description "取引履歴を JSON へ自動エクスポートします。自動売買 OFF でも動作します。"

#import "kernel32.dll"
   int  GetEnvironmentVariableW(string name, ushort &buf[], int bufSize);
   int  CreateDirectoryW(string path, long sec);
   long CreateFileW(string path, uint access, uint share, long sec,
                    uint disp, uint flags, long tmpl);
   bool WriteFile(long hFile, uchar &buf[], uint toWrite, uint &written[], long overlapped);
   bool CloseHandle(long hFile);
#import

#define GENERIC_WRITE         0x40000000
#define GENERIC_READ          0x80000000
#define CREATE_ALWAYS         2
#define OPEN_EXISTING         3
#define FILE_ATTRIBUTE_NORMAL 0x80
#define FILE_SHARE_READ       1

input int    RefreshMinutes  = 1;           // 定期エクスポート間隔（分）
input int    RealtimeSec     = 10;          // Tick 発生時の最小エクスポート間隔（秒）
input string ExportSubFolder = "MTExport"; // USERPROFILE 直下のサブフォルダ名
input int    ChartTimeframe  = 15;          // チャート時間足（分）: 1/5/15/30/60/240/1440
input int    ChartBars       = 200;         // チャート出力本数（最大500）

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
   long h = CreateFileW(triggerPath, GENERIC_READ, FILE_SHARE_READ, 0,
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

//+------------------------------------------------------------------+
bool WriteStringToFile(string filepath, string content)
{
   uchar buf[];
   int len = StringToCharArray(content, buf, 0, StringLen(content));
   if (len <= 0) return false;

   uint written[];
   ArrayResize(written, 1);
   long hFile = CreateFileW(filepath, GENERIC_WRITE, 0, 0, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, 0);
   if (hFile == -1) return false;

   bool ok = WriteFile(hFile, buf, (uint)len, written, 0);
   CloseHandle(hFile);
   return ok;
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

//+------------------------------------------------------------------+
string TimeToISO(datetime t)
{
   if (t == 0) return "";
   MqlDateTime dt;
   TimeToStruct(t, dt);
   return StringFormat("%04d-%02d-%02d %02d:%02d:%02d",
                       dt.year, dt.mon, dt.day, dt.hour, dt.min, dt.sec);
}

//+------------------------------------------------------------------+
//|  int(分) を ENUM_TIMEFRAMES に変換                               |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES IntToTimeframe(int minutes)
{
   switch(minutes)
   {
      case 1:    return PERIOD_M1;
      case 5:    return PERIOD_M5;
      case 15:   return PERIOD_M15;
      case 30:   return PERIOD_M30;
      case 60:   return PERIOD_H1;
      case 240:  return PERIOD_H4;
      case 1440: return PERIOD_D1;
      default:   return PERIOD_M15;
   }
}

//+------------------------------------------------------------------+
//|  保有ポジションのシンボルを収集（重複排除）                       |
//+------------------------------------------------------------------+
int CollectPositionSymbols(string &symbols[])
{
   int count = 0;
   int posTotal = PositionsTotal();
   for (int i = 0; i < posTotal; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if (ticket == 0) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
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
      Print("[MT5Exporter] USERPROFILE が取得できません");
      return;
   }

   CreateDirectoryW(exportDir, 0);

   long   accountNumber = AccountInfoInteger(ACCOUNT_LOGIN);
   string filepath = exportDir + "\\" + IntegerToString(accountNumber) + ".json";

   HistorySelect(0, TimeCurrent() + 1);
   int total = HistoryDealsTotal();

   string json = "{\n";
   json += "  \"account\": "      + IntegerToString(accountNumber)                         + ",\n";
   json += "  \"name\": \""       + EscapeJson(AccountInfoString(ACCOUNT_NAME))            + "\",\n";
   json += "  \"server\": \""     + EscapeJson(AccountInfoString(ACCOUNT_SERVER))          + "\",\n";
   json += "  \"currency\": \""   + AccountInfoString(ACCOUNT_CURRENCY)                   + "\",\n";
   json += "  \"balance\": "      + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)  + ",\n";
   json += "  \"equity\": "       + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY),  2)  + ",\n";
   json += "  \"credit\": "       + DoubleToString(AccountInfoDouble(ACCOUNT_CREDIT),  2)  + ",\n";
   json += "  \"leverage\": "     + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE))  + ",\n";
   json += "  \"exportTime\": \"" + TimeToISO(TimeCurrent())                              + "\",\n";
   json += "  \"autoTrading\": "  + ((bool)TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) ? "true" : "false") + ",\n";
   json += "  \"trades\": [\n";

   bool first = true;

   for (int i = 0; i < total; i++)
   {
      ulong outTicket = HistoryDealGetTicket(i);
      if (outTicket == 0) continue;

      ENUM_DEAL_ENTRY outEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(outTicket, DEAL_ENTRY);
      if (outEntry != DEAL_ENTRY_OUT && outEntry != DEAL_ENTRY_INOUT) continue;

      ENUM_DEAL_TYPE dealType = (ENUM_DEAL_TYPE)HistoryDealGetInteger(outTicket, DEAL_TYPE);
      if (dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      string   typeStr    = (dealType == DEAL_TYPE_BUY) ? "buy" : "sell";
      double   closePrice = HistoryDealGetDouble(outTicket,  DEAL_PRICE);
      double   volume     = HistoryDealGetDouble(outTicket,  DEAL_VOLUME);
      string   symbol     = HistoryDealGetString(outTicket,  DEAL_SYMBOL);
      datetime closeTime  = (datetime)HistoryDealGetInteger(outTicket, DEAL_TIME);
      double   profit     = HistoryDealGetDouble(outTicket,  DEAL_PROFIT);
      double   swap       = HistoryDealGetDouble(outTicket,  DEAL_SWAP);
      double   commission = HistoryDealGetDouble(outTicket,  DEAL_COMMISSION);
      string   comment    = HistoryDealGetString(outTicket,  DEAL_COMMENT);
      ulong    posId      = (ulong)HistoryDealGetInteger(outTicket, DEAL_POSITION_ID);

      datetime openTime  = closeTime;
      double   openPrice = closePrice;
      for (int j = 0; j < i; j++)
      {
         ulong inTicket = HistoryDealGetTicket(j);
         if (inTicket == 0) continue;
         if ((ulong)HistoryDealGetInteger(inTicket, DEAL_POSITION_ID) != posId) continue;
         ENUM_DEAL_ENTRY inEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(inTicket, DEAL_ENTRY);
         if (inEntry != DEAL_ENTRY_IN && inEntry != DEAL_ENTRY_INOUT) continue;
         openTime   = (datetime)HistoryDealGetInteger(inTicket, DEAL_TIME);
         openPrice  = HistoryDealGetDouble(inTicket, DEAL_PRICE);
         commission += HistoryDealGetDouble(inTicket, DEAL_COMMISSION);
         if (comment == "") comment = HistoryDealGetString(inTicket, DEAL_COMMENT);
         break;
      }

      if (!first) json += ",\n";
      first = false;

      json += "    {";
      json += "\"ticket\":"       + IntegerToString(outTicket)                       + ",";
      json += "\"openTime\":\""   + TimeToISO(openTime)                             + "\",";
      json += "\"closeTime\":\"" + TimeToISO(closeTime)                            + "\",";
      json += "\"type\":\""      + typeStr                                          + "\",";
      json += "\"size\":"        + DoubleToString(volume, 2)                        + ",";
      json += "\"symbol\":\""   + symbol                                            + "\",";
      json += "\"openPrice\":"  + DoubleToString(openPrice, 5)                      + ",";
      json += "\"closePrice\":" + DoubleToString(closePrice, 5)                     + ",";
      json += "\"sl\":0,\"tp\":0,";
      json += "\"commission\":"  + DoubleToString(commission, 2)                    + ",";
      json += "\"swap\":"        + DoubleToString(swap, 2)                          + ",";
      json += "\"profit\":"      + DoubleToString(profit, 2)                        + ",";
      json += "\"netProfit\":"   + DoubleToString(profit + swap + commission, 2)    + ",";
      json += "\"comment\":\""  + EscapeJson(comment)                               + "\"";
      json += "}";
   }

   json += "\n  ],\n";
   json += "  \"positions\": [\n";

   int posTotal = PositionsTotal();
   bool firstPos = true;
   for (int i = 0; i < posTotal; i++)
   {
      ulong posTicket = PositionGetTicket(i);
      if (posTicket == 0) continue;

      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      string typeStr = (posType == POSITION_TYPE_BUY) ? "buy" : "sell";

      if (!firstPos) json += ",\n";
      firstPos = false;

      json += "    {";
      json += "\"ticket\":"       + IntegerToString(posTicket)                                    + ",";
      json += "\"openTime\":\""   + TimeToISO((datetime)PositionGetInteger(POSITION_TIME))        + "\",";
      json += "\"type\":\""       + typeStr                                                        + "\",";
      json += "\"size\":"         + DoubleToString(PositionGetDouble(POSITION_VOLUME),       2)   + ",";
      json += "\"symbol\":\""     + PositionGetString(POSITION_SYMBOL)                            + "\",";
      json += "\"openPrice\":"    + DoubleToString(PositionGetDouble(POSITION_PRICE_OPEN),    5)  + ",";
      json += "\"currentPrice\":" + DoubleToString(PositionGetDouble(POSITION_PRICE_CURRENT), 5)  + ",";
      json += "\"sl\":"           + DoubleToString(PositionGetDouble(POSITION_SL),           5)   + ",";
      json += "\"tp\":"           + DoubleToString(PositionGetDouble(POSITION_TP),           5)   + ",";
      json += "\"profit\":"       + DoubleToString(PositionGetDouble(POSITION_PROFIT),       2)   + ",";
      json += "\"swap\":"         + DoubleToString(PositionGetDouble(POSITION_SWAP),         2)   + ",";
      json += "\"comment\":\""    + EscapeJson(PositionGetString(POSITION_COMMENT))               + "\"";
      json += "}";
   }

   // チャートデータ（保有ポジションのシンボル）
   json += "\n  ],\n";
   json += "  \"charts\": {\n";

   string symbols[];
   int symCount = CollectPositionSymbols(symbols);
   ENUM_TIMEFRAMES tf = IntToTimeframe(ChartTimeframe);
   int bars = MathMax(1, MathMin(ChartBars, 500));

   for (int si = 0; si < symCount; si++)
   {
      if (si > 0) json += ",\n";
      string sym    = symbols[si];
      int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

      MqlRates rates[];
      int copied = CopyRates(sym, tf, 0, bars, rates);

      json += "    \"" + sym + "\": {\"tf\":" + IntegerToString(ChartTimeframe) + ",\"candles\":[\n";

      bool firstBar = true;
      for (int i = copied - 1; i >= 0; i--)
      {
         if (!firstBar) json += ",\n";
         firstBar = false;
         json += "      {\"t\":\"" + TimeToISO(rates[i].time) + "\","
               + "\"o\":" + DoubleToString(rates[i].open,  digits) + ","
               + "\"h\":" + DoubleToString(rates[i].high,  digits) + ","
               + "\"l\":" + DoubleToString(rates[i].low,   digits) + ","
               + "\"c\":" + DoubleToString(rates[i].close, digits) + "}";
      }
      json += "\n    ]}";
   }

   json += "\n  }\n}\n";

   if (WriteStringToFile(filepath, json))
      Print("[MT5Exporter] エクスポート完了: ", filepath, "  (", total, " deals, ", posTotal, " positions, ", symCount, " charts)");
   else
      Print("[MT5Exporter] 書き込み失敗: ", filepath, "  エラー: ", GetLastError());
}
