import { createFileRoute } from "@tanstack/react-router";
import { Header } from "./dashboard.transactions";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, TrendingUp, Receipt, Lightbulb, Loader2, FileDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useI18n } from "@/lib/i18n";
import { api, downloadApi } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/assistant")({ component: Page });

type Attachment = {
  id: string;
  title: string;
  fileName: string;
  contentType: string;
  url: string;
};
type Msg = {
  who: "you" | "ai";
  text: string;
  attachment?: Attachment | null;
};

const SUGGESTED = [
  { icon: TrendingUp, text: "What's my net profit this month?" },
  { icon: Receipt, text: "Show me my top 5 expenses" },
  { icon: Lightbulb, text: "How can I reduce costs?" },
  { icon: Sparkles, text: "Forecast my cashflow for July" },
];

function Page() {
  const { t } = useI18n();
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: "ai", text: "Hi! I'm your AI finance assistant. Ask me anything about your books." },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMsgs((m) => [...m, { who: "you", text }]);
    setInput("");
    setLoading(true);
    try {
      const result = await api<{
        sessionId: string;
        response: string;
        agentResponse: string;
        intent:
          | "databaseSearchAgent"
          | "ragSearchAgent"
          | "financialReasoningAgent"
          | "other";
        reportMarkdown: string | null;
        agentOutput?: string;
        finalResponse?: string;
        attachment: Attachment | null;
      }>("/tenant/chatbot", {
        method: "POST",
        body: JSON.stringify({ sessionId, question: text }),
      });
      setSessionId(result.sessionId);
      setMsgs((m) => [
        ...m,
        {
          who: "ai",
          text: result.agentResponse,
          attachment: result.attachment,
        },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assistant request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col space-y-5">
      <Header title={t("astTitle")} desc={t("astDesc")} />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border-default rounded-2xl flex flex-col h-[600px] shadow-soft">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  m.who === "you"
                    ? "whitespace-pre-wrap bg-gradient-primary text-primary-foreground"
                    : "bg-surface-container text-on-surface"
                }`}>
                  {m.who === "ai" ? (
                    <div className="max-w-none overflow-x-auto text-inherit">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => <h1 className="mb-3 mt-1 text-xl font-bold">{children}</h1>,
                          h2: ({ children }) => <h2 className="mb-2 mt-4 text-lg font-semibold">{children}</h2>,
                          h3: ({ children }) => <h3 className="mb-2 mt-3 font-semibold">{children}</h3>,
                          p: ({ children }) => <p className="my-2 leading-6">{children}</p>,
                          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>,
                          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          a: ({ children, href }) => (
                            <a className="text-primary underline underline-offset-2" href={href} target="_blank" rel="noreferrer">
                              {children}
                            </a>
                          ),
                          table: ({ children }) => (
                            <table className="my-3 min-w-full border-collapse text-xs">{children}</table>
                          ),
                          th: ({ children }) => (
                            <th className="border border-border-default bg-card px-2 py-1.5 text-start font-semibold">{children}</th>
                          ),
                          td: ({ children }) => <td className="border border-border-default px-2 py-1.5">{children}</td>,
                          code: ({ children }) => (
                            <code className="rounded bg-card px-1 py-0.5 font-mono text-xs">{children}</code>
                          ),
                          hr: () => <hr className="my-4 border-border-default" />,
                        }}
                      >
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    m.text
                  )}
                  {m.attachment && (
                    <button
                      onClick={() =>
                        downloadApi(m.attachment!.url, m.attachment!.fileName).catch((error) =>
                          toast.error(error instanceof Error ? error.message : "Download failed"),
                        )
                      }
                      className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border-default bg-card p-3 text-start text-on-surface hover:border-primary/50"
                    >
                      <span className="rounded-lg bg-primary/10 p-2 text-primary">
                        <FileDown className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{m.attachment.title}</span>
                        <span className="block text-xs text-muted-foreground">PDF report</span>
                      </span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-surface-container px-4 py-3 text-sm text-on-surface">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-border-default p-3 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder={t("askFinances")}
              className="bg-surface-subtle text-black"
            />
            <Button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="bg-gradient-primary"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border-default rounded-2xl p-5">
            <h3 className="text-sm font-semibold mb-3">{t("suggestedPrompts")}</h3>
            <div className="space-y-2">
              {SUGGESTED.map((s) => (
                <button
                  key={s.text}
                  onClick={() => send(s.text)}
                  className="w-full text-start p-3 rounded-lg border border-border-default hover:border-primary/40 hover:bg-surface-subtle text-sm flex items-center gap-2"
                >
                  <s.icon className="h-4 w-4 text-primary shrink-0" /> {s.text}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-gradient-primary text-primary-foreground rounded-2xl p-5">
            <Sparkles className="h-5 w-5 mb-2" />
            <p className="text-sm font-medium">{t("proTip")}</p>
            <p className="text-xs opacity-90 mt-1">
              {t("proTipDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
