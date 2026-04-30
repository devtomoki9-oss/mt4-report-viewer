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
//|  mt4_report_<口座番号>.json  (MT4 と同じ形式)                    |
//+------------------------------------------------------------------+
#property copyright ""
#property link      ""
#property version   "1.10"
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

#define TIMER_SEC 5

int      g_ExportTick         = 0;
datetime g_LastTriggerExport  = 0;
datetime g_LastRealtimeExport = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(TIMER_SEC);
   ExportTrades();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason) { EventKillTimer(); }

void OnTick()
{
   datetime now = TimeCurrent();
   if (now - g_LastRealtimeExport >= RealtimeSec)
   {
      g_LastRealtimeExport = now;
      g_ExportTick = 0;
      ExportTrades();
   }
}

void OnTimer()
{
   bool triggered = CheckTrigger();
   g_ExportTick++;
   if (triggered || g_ExportTick >= (RefreshMinutes * 60 / TIMER_SEC))
   {
      g_ExportTick = 0;
      ExportTrades();
   }
}

//+------------------------------------------------------------------+
//|  トリガーファイル（_refresh.cmd）を確認する                      |
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
//|  取引履歴を JSON ファイルに書き出す                              |
//|  OUT/INOUT ディールを起点に IN ディールを position ID で検索し   |
//|  MT4 と同形式の完結したトレードレコードを出力する                |
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
   string filepath = exportDir + "\\mt4_report_" + IntegerToString(accountNumber) + ".json";

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

      // 対応する IN ディールをポジション ID で検索
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

   json += "\n  ]\n}\n";

   if (WriteStringToFile(filepath, json))
      Print("[MT5Exporter] エクスポート完了: ", filepath, "  (", total, " deals, ", posTotal, " positions)");
   else
      Print("[MT5Exporter] 書き込み失敗: ", filepath, "  エラー: ", GetLastError());
}
