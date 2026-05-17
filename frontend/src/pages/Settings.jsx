import { useEffect, useState } from "react";
import { getLineTokenStatus, setLineToken, testLineNotification } from "../api/client";
import { useLang } from "../context/LangContext";

export default function Settings() {
  const { t, lang, setLanguage } = useLang();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState(null); // { configured, preview }
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    getLineTokenStatus().then(setStatus).catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await setLineToken(token);
      const s = await getLineTokenStatus();
      setStatus(s);
      setSaved(true);
      setToken("");
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await testLineNotification();
      setTestResult("ok");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("set_title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("set_subtitle")}</p>
      </div>

      {/* Language switcher */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">🌐 Language / ภาษา</h2>
        <p className="text-sm text-gray-500 mb-4">Choose your preferred language</p>
        <div className="flex gap-3">
          {[
            { code: "en", label: "🇬🇧 English" },
            { code: "th", label: "🇹🇭 ภาษาไทย" },
          ].map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              className={`px-5 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                lang === code
                  ? "bg-green-700 border-green-700 text-white"
                  : "border-gray-200 text-gray-600 hover:border-green-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* LINE Notify */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <span className="text-xl">💬</span>
              {t("set_line_title")}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t("set_line_desc")}</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            status?.configured
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}>
            {status?.configured ? `✓ ${t("set_line_enabled")}` : t("set_line_disabled")}
          </span>
        </div>

        {status?.configured && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">Token: {status.preview}</p>
              <p className="text-xs text-green-600 mt-0.5">High &amp; Critical alerts will be sent to LINE automatically</p>
            </div>
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {testing ? t("set_line_testing") : t("set_line_test")}
            </button>
          </div>
        )}

        {testResult === "ok" && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            {t("set_line_test_ok")}
          </div>
        )}
        {testResult === "fail" && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {t("set_line_test_fail")}
          </div>
        )}

        {/* How to get token */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-blue-800 mb-2">{t("set_line_how")}</p>
          <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
            <li>
              {t("set_line_step1")}{" "}
              <a
                href="https://notify.line.me"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                notify.line.me
              </a>
            </li>
            <li>{t("set_line_step2")}</li>
            <li>{t("set_line_step3")}</li>
            <li>{t("set_line_step4")}</li>
          </ol>
        </div>

        {/* Token form */}
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("set_line_token")}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t("set_line_placeholder")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !token.trim()}
            className="px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50 transition-colors"
          >
            {saved ? t("set_line_saved") : saving ? t("set_line_saving") : t("set_line_save")}
          </button>
        </form>

        {/* Alert rules */}
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">{t("set_alerts_title")}</p>
          <div className="space-y-2">
            {[
              { label: t("set_alerts_critical"), always: true },
              { label: t("set_alerts_high"), always: true },
              { label: t("set_alerts_harvest"), always: true },
              { label: t("set_alerts_irrigation"), always: true },
            ].map(({ label }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
