import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Sparkles, Send, Bot, User, Trash2, TrendingUp, AlertTriangle, Package, Lightbulb, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

const QUICK_PROMPTS = [
  { label: 'Omzet hari ini', icon: TrendingUp, prompt: 'Berapa omzet hari ini?' },
  { label: 'Laba hari ini', icon: TrendingUp, prompt: 'Berapa laba hari ini?' },
  { label: 'Produk terlaris', icon: Package, prompt: 'Apa produk terlaris?' },
  { label: 'Barang hampir habis', icon: AlertTriangle, prompt: 'Barang apa yang hampir habis?' },
  { label: 'Barang harus dibeli', icon: Package, prompt: 'Barang apa yang harus segera dibeli?' },
  { label: 'Pelanggan terbaik', icon: User, prompt: 'Siapa pelanggan terbaik?' },
];

export function AISidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from('ai_conversations').select('role, content, created_at').order('created_at', { ascending: false }).limit(20);
    if (data && data.length > 0) {
      const msgs = data.reverse().map((d: any) => ({ role: d.role, content: d.content, timestamp: d.created_at }));
      setMessages(msgs);
      setHistory(msgs);
    }
  }, []);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const callAI = async (action: string, body: any) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...body }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'AI request failed');
    return data;
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text, timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const result = await callAI('chat', {
        message: text,
        history: history.map((h) => ({ role: h.role, content: h.content })),
      });
      const assistantMsg: Message = { role: 'assistant', content: result.response, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, assistantMsg]);
      setHistory((prev) => [...prev, userMsg, assistantMsg]);
    } catch (e: any) {
      const errMsg: Message = { role: 'assistant', content: `Maaf, terjadi error: ${e.message}`, timestamp: new Date().toISOString() };
      setMessages((prev) => [...prev, errMsg]);
      toast({ title: 'AI Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    await supabase.from('ai_conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setMessages([]);
    setHistory([]);
    toast({ title: 'Riwayat chat dihapus' });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[440px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <SheetTitle className="text-base">KaSandra AI</SheetTitle>
              <p className="text-[10px] text-muted-foreground">Business Assistant</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearChat} title="Hapus riwayat">
            <Trash2 className="w-4 h-4" />
          </Button>
        </SheetHeader>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="font-medium text-sm">Halo! Saya KaSandra AI</p>
                <p className="text-xs text-muted-foreground mt-1">Tanyakan apa saja tentang bisnis Anda</p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                {QUICK_PROMPTS.map((qp) => {
                  const Icon = qp.icon;
                  return (
                    <button
                      key={qp.label}
                      onClick={() => sendMessage(qp.prompt)}
                      className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-accent text-left text-xs font-medium transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>{qp.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={cn('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-gradient-to-br from-sky-500 to-emerald-500 text-white',
              )}>
                {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div className={cn(
                'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap',
                msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm',
              )}>
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tanya KaSandra AI..."
              disabled={loading}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={loading || !input.trim()}>
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function AIInsightCard({ insights, recommendations, loading }: {
  insights: string;
  recommendations: any[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {insights && (
        <div className="p-4 rounded-xl bg-gradient-to-br from-sky-500/5 to-emerald-500/5 border border-sky-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <h4 className="font-medium text-sm">AI Insight</h4>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{insights}</p>
        </div>
      )}

      {recommendations.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h4 className="font-medium text-sm">Smart Recommendations</h4>
          </div>
          <div className={cn('space-y-2', !expanded && 'max-h-32 overflow-hidden')}>
            {recommendations.map((rec, i) => {
              const priorityColor = rec.priority === 'critical' ? 'border-red-500/40 bg-red-500/5' :
                rec.priority === 'high' ? 'border-orange-500/40 bg-orange-500/5' :
                rec.priority === 'medium' ? 'border-amber-500/40 bg-amber-500/5' :
                'border-emerald-500/40 bg-emerald-500/5';
              return (
                <div key={i} className={cn('p-3 rounded-lg border', priorityColor)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>
                    </div>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                      rec.priority === 'critical' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                      rec.priority === 'high' ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' :
                      rec.priority === 'medium' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                      'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                    )}>
                      {rec.priority}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {recommendations.length > 2 && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-primary hover:underline mt-1">
              {expanded ? 'Sembunyikan' : `Lihat ${recommendations.length - 2} rekomendasi lainnya`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
