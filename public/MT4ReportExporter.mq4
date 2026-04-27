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
//|  mt4_report_<口座番号>.json                                      |
//+------------------------------------------------------------------+
#property copyright ""
#property link      ""
#property version   "1.40"
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

input int    RefreshMinutes  = 5;            // 定期エクスポート間隔（分）
input string ExportSubFolder = "MTExport";  // USERPROFILE 直下のサブフォルダ名

// タイマー間隔（秒）: トリガーファイルをこの間隔でチェックする
#define TIMER_SEC 5

int      g_ExportTick        = 0; // TIMER_SEC 単位のカウンター
datetime g_LastTriggerExport = 0; // 直近のトリガー発火時刻（二重発火防止）

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(TIMER_SEC);
   ExportTrades();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTimer()
{
   // ブラウザからの即時エクスポート要求をチェック
   bool triggered = CheckTrigger();

   g_ExportTick++;
   // triggered の場合、または定期インターバルに達した場合にエクスポート
   if (triggered || g_ExportTick >= (RefreshMinutes * 60 / TIMER_SEC))
   {
      g_ExportTick = 0;
      ExportTrades();
   }
}

//+------------------------------------------------------------------+
//|  トリガーファイル（_refresh.cmd）を確認する                      |
//|  ブラウザが書き込むと即時エクスポートが発動する                  |
//|  ファイルの削除はブラウザ側が行う（全インスタンス対応のため）    |
//+------------------------------------------------------------------+
bool CheckTrigger()
{
   string triggerPath = GetExportDir() + "\\_refresh.cmd";
   int h = CreateFileW(triggerPath, GENERIC_READ, FILE_SHARE_READ, 0,
                       OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return false;
   CloseHandle(h);

   // 30秒以内の二重発火を防ぐ
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

   string filepath = exportDir + "\\mt4_report_" + IntegerToString(AccountNumber()) + ".json";

   string json = "{\n";
   json += "  \"account\": "     + IntegerToString(AccountNumber())     + ",\n";
   json += "  \"name\": \""      + EscapeJson(AccountName())            + "\",\n";
   json += "  \"server\": \""    + EscapeJson(AccountServer())          + "\",\n";
   json += "  \"currency\": \""  + AccountCurrency()                    + "\",\n";
   json += "  \"balance\": "     + DoubleToString(AccountBalance(), 2)  + ",\n";
   json += "  \"equity\": "      + DoubleToString(AccountEquity(),  2)  + ",\n";
   json += "  \"leverage\": "    + IntegerToString(AccountLeverage())   + ",\n";
   json += "  \"exportTime\": \""+ TimeToISO(TimeCurrent())             + "\",\n";
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

   json += "\n  ]\n}\n";

   if (WriteStringToFile(filepath, json))
      Print("[MTExporter] エクスポート完了: ", filepath, "  (", total, " 件, ", openTotal, " positions)");
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
