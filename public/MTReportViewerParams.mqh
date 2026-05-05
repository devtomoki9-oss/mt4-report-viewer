//+------------------------------------------------------------------+
//|  MTReportViewerParams.mqh                                        |
//|  MT4/MT5 共通 EA パラメータ管理 SDK                              |
//|                                                                  |
//|  使い方（最小例）:                                               |
//|  ----------------------------------------------------------------|
//|  #include <MTReportViewerParams.mqh>                             |
//|                                                                  |
//|  input int    Lot      = 1;                                       |
//|  input bool   UseTrend = true;                                    |
//|  input string Mode     = "A";                                     |
//|                                                                  |
//|  int OnInit()                                                    |
//|  {                                                               |
//|     ParamReset();                                                 |
//|     ParamRegisterInt   ("Lot",      Lot,      1, 100);            |
//|     ParamRegisterBool  ("UseTrend", UseTrend);                    |
//|     ParamRegisterEnum  ("Mode",     Mode,     "A|B|C");           |
//|     ParamPublish();                                                |
//|     EventSetTimer(5);                                             |
//|     return INIT_SUCCEEDED;                                        |
//|  }                                                                |
//|                                                                  |
//|  void OnTimer()                                                   |
//|  {                                                                |
//|     if (ParamPoll())                                               |
//|     {                                                             |
//|        Lot      = ParamGetInt   ("Lot");                          |
//|        UseTrend = ParamGetBool  ("UseTrend");                     |
//|        Mode     = ParamGetString("Mode");                         |
//|        ParamPublishActual();                                       |
//|     }                                                             |
//|  }                                                                |
//|                                                                  |
//|  void OnDeinit(const int reason) { ParamCleanup(); }              |
//+------------------------------------------------------------------+
#property strict

#ifdef __MQL5__
   #import "kernel32.dll"
      int  GetEnvironmentVariableW(string name, ushort &buf[], int bufSize);
      int  CreateDirectoryW(string path, long sec);
      long CreateFileW(string path, uint access, uint share, long sec,
                       uint disp, uint flags, long tmpl);
      bool WriteFile (long hFile, uchar &buf[], uint toWrite, uint &written[], long overlapped);
      bool ReadFile  (long hFile, uchar &buf[], uint toRead,  uint &read[],    long overlapped);
      bool CloseHandle(long hFile);
      bool DeleteFileW(string path);
      bool GetFileTime(long hFile, ulong &creation, ulong &access, ulong &write);
   #import
#else
   #import "kernel32.dll"
      int  GetEnvironmentVariableW(string name, ushort &buf[], int bufSize);
      int  CreateDirectoryW(string path, int sec);
      int  CreateFileW(string path, uint access, uint share, int sec,
                       uint disp, uint flags, int tmpl);
      bool WriteFile (int hFile, uchar &buf[], uint toWrite, uint &written[], int overlapped);
      bool ReadFile  (int hFile, uchar &buf[], uint toRead,  uint &read[],    int overlapped);
      bool CloseHandle(int hFile);
      bool DeleteFileW(string path);
      bool GetFileTime(int hFile, ulong &creation, ulong &access, ulong &write);
   #import
#endif

#define PV_TYPE_INT     1
#define PV_TYPE_DOUBLE  2
#define PV_TYPE_BOOL    3
#define PV_TYPE_STRING  4
#define PV_TYPE_ENUM    5

#define PV_MAX 64

#define PV_GENERIC_WRITE          0x40000000
#define PV_GENERIC_READ           0x80000000
#define PV_CREATE_ALWAYS          2
#define PV_OPEN_EXISTING          3
#define PV_FILE_ATTRIBUTE_NORMAL  0x80
#define PV_FILE_SHARE_READ        1

string  g_pv_name [PV_MAX];
int     g_pv_type [PV_MAX];
string  g_pv_str  [PV_MAX];
string  g_pv_def  [PV_MAX];
string  g_pv_min  [PV_MAX];
string  g_pv_max  [PV_MAX];
string  g_pv_enum [PV_MAX];
int     g_pv_count = 0;

ulong   g_pv_lastDesiredFt = 0;
string  g_pv_subFolder     = "MTExport";

//+------------------------------------------------------------------+
string PV_ExportDir()
{
   ushort buf[260];
   int len = GetEnvironmentVariableW("USERPROFILE", buf, 260);
   if (len <= 0) return "";
   string base = ShortArrayToString(buf, 0, len);
   return base + "\\" + g_pv_subFolder;
}

//+------------------------------------------------------------------+
string PV_TfStr()
{
#ifdef __MQL5__
   int sec = PeriodSeconds();
   int min = sec / 60;
#else
   int min = Period();
#endif
   switch(min)
   {
      case 1:     return "M1";
      case 5:     return "M5";
      case 15:    return "M15";
      case 30:    return "M30";
      case 60:    return "H1";
      case 240:   return "H4";
      case 1440:  return "D1";
      case 10080: return "W1";
      case 43200: return "MN1";
   }
   return IntegerToString(min);
}

string PV_ChartId()
{
   long cid = (long)ChartID();
   return Symbol() + "#" + PV_TfStr() + "#" + IntegerToString((int)cid);
}

long PV_Account()
{
#ifdef __MQL5__
   return AccountInfoInteger(ACCOUNT_LOGIN);
#else
   return (long)AccountNumber();
#endif
}

string PV_EaName()
{
#ifdef __MQL5__
   return MQLInfoString(MQL5_PROGRAM_NAME);
#else
   return WindowExpertName();
#endif
}

string PV_BasePath()
{
   string dir = PV_ExportDir();
   if (dir == "") return "";
   CreateDirectoryW(dir, 0);
   return dir + "\\" + IntegerToString(PV_Account()) + "__" + PV_ChartId();
}

string PV_PathManifest() { string b = PV_BasePath(); return (b == "" ? "" : b + ".manifest.json"); }
string PV_PathActual()   { string b = PV_BasePath(); return (b == "" ? "" : b + ".actual.json");   }
string PV_PathDesired()  { string b = PV_BasePath(); return (b == "" ? "" : b + ".desired.json");  }

//+------------------------------------------------------------------+
string PV_EscapeJson(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\n", "\\n");
   StringReplace(s, "\r", "\\r");
   StringReplace(s, "\t", "\\t");
   return s;
}

//+------------------------------------------------------------------+
//|  ファイル I/O（プラットフォームごとに分岐）                       |
//+------------------------------------------------------------------+
bool PV_WriteFile(string filepath, string content)
{
   if (filepath == "") return false;
   uchar buf[];
   int len = StringToCharArray(content, buf, 0, StringLen(content));
   if (len <= 0) return false;
   uint written[1];
#ifdef __MQL5__
   long h = CreateFileW(filepath, PV_GENERIC_WRITE, 0, 0, PV_CREATE_ALWAYS, PV_FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return false;
   bool ok = WriteFile(h, buf, (uint)len, written, 0);
   CloseHandle(h);
   return ok;
#else
   int h = CreateFileW(filepath, PV_GENERIC_WRITE, 0, 0, PV_CREATE_ALWAYS, PV_FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return false;
   bool ok = WriteFile(h, buf, (uint)len, written, 0);
   CloseHandle(h);
   return ok;
#endif
}

string PV_ReadFile(string filepath)
{
   if (filepath == "") return "";
   uchar buf[];
   ArrayResize(buf, 65536);
   uint readBytes[1];
   string out = "";
#ifdef __MQL5__
   long h = CreateFileW(filepath, PV_GENERIC_READ, PV_FILE_SHARE_READ, 0, PV_OPEN_EXISTING, PV_FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return "";
   while (true)
   {
      readBytes[0] = 0;
      bool ok = ReadFile(h, buf, 65536, readBytes, 0);
      if (!ok || readBytes[0] == 0) break;
      out += CharArrayToString(buf, 0, (int)readBytes[0]);
      if (readBytes[0] < 65536) break;
   }
   CloseHandle(h);
#else
   int h = CreateFileW(filepath, PV_GENERIC_READ, PV_FILE_SHARE_READ, 0, PV_OPEN_EXISTING, PV_FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return "";
   while (true)
   {
      readBytes[0] = 0;
      bool ok = ReadFile(h, buf, 65536, readBytes, 0);
      if (!ok || readBytes[0] == 0) break;
      out += CharArrayToString(buf, 0, (int)readBytes[0]);
      if (readBytes[0] < 65536) break;
   }
   CloseHandle(h);
#endif
   return out;
}

ulong PV_FileTime(string filepath)
{
   if (filepath == "") return 0;
   ulong c = 0, a = 0, w = 0;
#ifdef __MQL5__
   long h = CreateFileW(filepath, PV_GENERIC_READ, PV_FILE_SHARE_READ, 0, PV_OPEN_EXISTING, PV_FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return 0;
   GetFileTime(h, c, a, w);
   CloseHandle(h);
#else
   int h = CreateFileW(filepath, PV_GENERIC_READ, PV_FILE_SHARE_READ, 0, PV_OPEN_EXISTING, PV_FILE_ATTRIBUTE_NORMAL, 0);
   if (h == -1) return 0;
   GetFileTime(h, c, a, w);
   CloseHandle(h);
#endif
   return w;
}

//+------------------------------------------------------------------+
//|  登録 API                                                         |
//+------------------------------------------------------------------+
void ParamReset() { g_pv_count = 0; g_pv_lastDesiredFt = 0; }

void ParamSetSubFolder(string sub) { g_pv_subFolder = sub; }

void PV_Add(string name, int type, string current, string def, string mn, string mx, string en)
{
   if (g_pv_count >= PV_MAX) return;
   g_pv_name [g_pv_count] = name;
   g_pv_type [g_pv_count] = type;
   g_pv_str  [g_pv_count] = current;
   g_pv_def  [g_pv_count] = def;
   g_pv_min  [g_pv_count] = mn;
   g_pv_max  [g_pv_count] = mx;
   g_pv_enum [g_pv_count] = en;
   g_pv_count++;
}

void ParamRegisterInt(string name, int value, int mn = 0, int mx = 0)
{
   bool hasRange = !(mn == 0 && mx == 0);
   PV_Add(name, PV_TYPE_INT,
          IntegerToString(value),
          IntegerToString(value),
          hasRange ? IntegerToString(mn) : "",
          hasRange ? IntegerToString(mx) : "",
          "");
}
void ParamRegisterDouble(string name, double value, double mn = 0, double mx = 0, int digits = 4)
{
   bool hasRange = !(mn == 0 && mx == 0);
   PV_Add(name, PV_TYPE_DOUBLE,
          DoubleToString(value, digits),
          DoubleToString(value, digits),
          hasRange ? DoubleToString(mn, digits) : "",
          hasRange ? DoubleToString(mx, digits) : "",
          "");
}
void ParamRegisterBool(string name, bool value)
{
   string s = value ? "true" : "false";
   PV_Add(name, PV_TYPE_BOOL, s, s, "", "", "");
}
void ParamRegisterString(string name, string value)
{
   PV_Add(name, PV_TYPE_STRING, value, value, "", "", "");
}
void ParamRegisterEnum(string name, string value, string options)
{
   PV_Add(name, PV_TYPE_ENUM, value, value, "", "", options);
}

//+------------------------------------------------------------------+
int PV_IndexOf(string name)
{
   for (int i = 0; i < g_pv_count; i++)
      if (g_pv_name[i] == name) return i;
   return -1;
}

string ParamGetString(string name) { int i = PV_IndexOf(name); return (i < 0 ? "" : g_pv_str[i]); }
int    ParamGetInt   (string name) { int i = PV_IndexOf(name); return (i < 0 ? 0  : (int)StringToInteger(g_pv_str[i])); }
double ParamGetDouble(string name) { int i = PV_IndexOf(name); return (i < 0 ? 0  : StringToDouble(g_pv_str[i])); }
bool   ParamGetBool  (string name) { int i = PV_IndexOf(name); return (i < 0 ? false : (g_pv_str[i] == "true")); }

//+------------------------------------------------------------------+
//|  JSON 構築                                                       |
//+------------------------------------------------------------------+
string PV_TypeName(int t)
{
   if (t == PV_TYPE_INT)    return "int";
   if (t == PV_TYPE_DOUBLE) return "double";
   if (t == PV_TYPE_BOOL)   return "bool";
   if (t == PV_TYPE_ENUM)   return "enum";
   return "string";
}

string PV_DefaultLiteral(int idx)
{
   int t = g_pv_type[idx];
   if (t == PV_TYPE_STRING || t == PV_TYPE_ENUM) return "\"" + PV_EscapeJson(g_pv_def[idx]) + "\"";
   return g_pv_def[idx];
}

string PV_ValueLiteral(int idx)
{
   int t = g_pv_type[idx];
   string v = g_pv_str[idx];
   if (t == PV_TYPE_INT || t == PV_TYPE_DOUBLE) return v;
   if (t == PV_TYPE_BOOL) return (v == "true" ? "true" : "false");
   return "\"" + PV_EscapeJson(v) + "\"";
}

string PV_BuildManifestJson()
{
   string s = "{\n";
   s += "  \"account\": "    + IntegerToString(PV_Account())     + ",\n";
   s += "  \"chartId\": \""  + PV_EscapeJson(PV_ChartId())       + "\",\n";
   s += "  \"eaName\": \""   + PV_EscapeJson(PV_EaName())        + "\",\n";
   s += "  \"symbol\": \""   + PV_EscapeJson(Symbol())           + "\",\n";
   s += "  \"timeframe\": \""+ PV_EscapeJson(PV_TfStr())         + "\",\n";
   s += "  \"params\": [\n";
   for (int i = 0; i < g_pv_count; i++)
   {
      if (i > 0) s += ",\n";
      s += "    {";
      s += "\"name\":\""    + PV_EscapeJson(g_pv_name[i]) + "\",";
      s += "\"type\":\""    + PV_TypeName(g_pv_type[i])   + "\",";
      s += "\"default\":"   + PV_DefaultLiteral(i);
      if (g_pv_min[i] != "") s += ",\"min\":" + g_pv_min[i];
      if (g_pv_max[i] != "") s += ",\"max\":" + g_pv_max[i];
      if (g_pv_enum[i] != "")
      {
         s += ",\"options\":[";
         string parts[];
         int n = StringSplit(g_pv_enum[i], '|', parts);
         for (int k = 0; k < n; k++) { if (k > 0) s += ","; s += "\"" + PV_EscapeJson(parts[k]) + "\""; }
         s += "]";
      }
      s += "}";
   }
   s += "\n  ]\n}\n";
   return s;
}

string PV_BuildActualJson()
{
   string s = "{\n";
   s += "  \"account\": "    + IntegerToString(PV_Account())     + ",\n";
   s += "  \"chartId\": \""  + PV_EscapeJson(PV_ChartId())       + "\",\n";
   s += "  \"values\": {\n";
   for (int i = 0; i < g_pv_count; i++)
   {
      if (i > 0) s += ",\n";
      s += "    \"" + PV_EscapeJson(g_pv_name[i]) + "\": " + PV_ValueLiteral(i);
   }
   s += "\n  }\n}\n";
   return s;
}

//+------------------------------------------------------------------+
//|  簡易 JSON 値抽出（"key": <value> パターンを検索）                |
//+------------------------------------------------------------------+
string PV_ExtractValue(string json, string key)
{
   string needle = "\"" + key + "\"";
   int pos = StringFind(json, needle, 0);
   if (pos < 0) return "";
   pos += StringLen(needle);
   while (pos < StringLen(json))
   {
      ushort c = StringGetCharacter(json, pos);
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == ':') { pos++; continue; }
      break;
   }
   if (pos >= StringLen(json)) return "";
   ushort first = StringGetCharacter(json, pos);
   if (first == '"')
   {
      pos++;
      int start = pos;
      while (pos < StringLen(json))
      {
         ushort c = StringGetCharacter(json, pos);
         if (c == '\\' && pos + 1 < StringLen(json)) { pos += 2; continue; }
         if (c == '"') break;
         pos++;
      }
      string raw = StringSubstr(json, start, pos - start);
      StringReplace(raw, "\\\"", "\"");
      StringReplace(raw, "\\\\", "\\");
      StringReplace(raw, "\\n", "\n");
      StringReplace(raw, "\\r", "\r");
      StringReplace(raw, "\\t", "\t");
      return raw;
   }
   int start = pos;
   while (pos < StringLen(json))
   {
      ushort c = StringGetCharacter(json, pos);
      if (c == ',' || c == '}' || c == ']' || c == ' ' || c == '\n' || c == '\r' || c == '\t') break;
      pos++;
   }
   return StringSubstr(json, start, pos - start);
}

//+------------------------------------------------------------------+
//|  公開 API                                                         |
//+------------------------------------------------------------------+
bool ParamPublish()
{
   bool ok1 = PV_WriteFile(PV_PathManifest(), PV_BuildManifestJson());
   bool ok2 = PV_WriteFile(PV_PathActual(),   PV_BuildActualJson());
   return ok1 && ok2;
}

bool ParamPublishActual()
{
   return PV_WriteFile(PV_PathActual(), PV_BuildActualJson());
}

bool ParamPoll()
{
   string path = PV_PathDesired();
   ulong  ft   = PV_FileTime(path);
   if (ft == 0) return false;
   if (ft <= g_pv_lastDesiredFt) return false;

   string body = PV_ReadFile(path);
   g_pv_lastDesiredFt = ft;
   if (body == "") return false;

   bool changed = false;
   int valuesPos = StringFind(body, "\"values\"", 0);
   string scope  = (valuesPos >= 0) ? StringSubstr(body, valuesPos) : body;

   for (int i = 0; i < g_pv_count; i++)
   {
      string v = PV_ExtractValue(scope, g_pv_name[i]);
      if (v == "") continue;
      if (g_pv_type[i] == PV_TYPE_BOOL) v = (v == "true" ? "true" : "false");
      if (v != g_pv_str[i]) { g_pv_str[i] = v; changed = true; }
   }
   return changed;
}

void ParamCleanup()
{
   string m = PV_PathManifest();
   string a = PV_PathActual();
   string d = PV_PathDesired();
   if (m != "") DeleteFileW(m);
   if (a != "") DeleteFileW(a);
   if (d != "") DeleteFileW(d);
}
