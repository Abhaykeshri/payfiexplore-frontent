import { useEffect, useState } from "react";
import {
  Search,
  Boxes,
  Clock3,
  ShieldCheck,
  Server,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Copy,
} from "lucide-react";

const API = "https://payfi-explore-bcakend.onrender.com/api";
const ACCENT = "#e1ec86";

function normalizeTx(tx) {
  return {
    hash: tx.txhash,
    height: tx.height,
    code: Number(tx.code || 0),
    gasUsed: tx.gas_used,
    gasWanted: tx.gas_wanted,
    timestamp: tx.timestamp,
    raw: tx,
  };
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [txs, setTxs] = useState([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("home");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState("");

  async function get(path) {
    const res = await fetch(`${API}${path}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "API Error");
    }

    return data;
  }

  function mergeTxs(oldTxs, newTxs) {
    return Array.from(
      new Map([...newTxs, ...oldTxs].map((tx) => [tx.hash, tx])).values()
    ).sort((a, b) => Number(b.height) - Number(a.height));
  }

  async function getTxsByHeight(height) {
    try {
      const data = await get(
        `/cosmos/tx/v1beta1/txs?events=tx.height=${height}&pagination.limit=100`
      );

      return (data.tx_responses || []).map(normalizeTx);
    } catch {
      return [];
    }
  }

  async function loadBlocksAndStatus() {
    try {
      setLoading(true);

      const s = await get("/status");
      setStatus(s);

      const latestHeight = Number(s.result.sync_info.latest_block_height);

      const blockHeights = Array.from(
        { length: Math.min(10, latestHeight) },
        (_, i) => latestHeight - i
      );

      const blockResults = await Promise.allSettled(
        blockHeights.map((h) => get(`/block?height=${h}`))
      );

      const loadedBlocks = blockResults
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);

      setBlocks(loadedBlocks);

      return latestHeight;
    } catch (err) {
      setError(err.message);
      return 0;
    } finally {
      setLoading(false);
    }
  }

  async function loadAllTransactions(latestHeight) {
    if (!latestHeight) return;

    try {
      setTxLoading(true);

      const batchSize = 25;
      let allFound = [];

      for (let start = latestHeight; start >= 1; start -= batchSize) {
        const heights = [];

        for (let h = start; h >= Math.max(1, start - batchSize + 1); h--) {
          heights.push(h);
        }

        const results = await Promise.allSettled(
          heights.map((h) => getTxsByHeight(h))
        );

        const batchTxs = results.flatMap((r) =>
          r.status === "fulfilled" ? r.value : []
        );

        if (batchTxs.length) {
          allFound = mergeTxs(allFound, batchTxs);

          setTxs((prev) => mergeTxs(prev, batchTxs));
        }
      }
    } finally {
      setTxLoading(false);
    }
  }

  async function loadHome() {
    const latestHeight = await loadBlocksAndStatus();
    await loadAllTransactions(latestHeight);
  }

  async function refreshNewDataOnly() {
    try {
      const latestHeight = await loadBlocksAndStatus();

      const recentHeights = Array.from(
        { length: Math.min(25, latestHeight) },
        (_, i) => latestHeight - i
      );

      const results = await Promise.allSettled(
        recentHeights.map((h) => getTxsByHeight(h))
      );

      const newTxs = results.flatMap((r) =>
        r.status === "fulfilled" ? r.value : []
      );

      if (newTxs.length) {
        setTxs((prev) => mergeTxs(prev, newTxs));
      }
    } catch {}
  }

  async function search(e) {
    e.preventDefault();

    const q = query.trim();

    if (!q) return;

    try {
      setLoading(true);
      setError("");

      if (/^\d+$/.test(q)) {
        await openBlock(q);
        return;
      }

      if (q.startsWith("payfi") || q.startsWith("cosmos") || q.startsWith("0x")) {
        await openAddress(q);
        return;
      }

      await openTx(q);
    } catch {
      setError("Not Found");
    } finally {
      setLoading(false);
    }
  }

  async function openBlock(height) {
    const [block, blockTxs] = await Promise.all([
      get(`/block?height=${height}`),
      getTxsByHeight(height),
    ]);

    setResult({
      type: "block",
      block,
      txs: blockTxs,
    });

    setView("result");
  }

  async function openTx(hash) {
    const clean = hash.replace(/^0x/i, "");

    const data = await get(`/cosmos/tx/v1beta1/txs/${clean}`);

    setResult({
      type: "tx",
      tx: normalizeTx(data.tx_response),
      full: data,
    });

    setView("result");
  }

  async function openAddress(address) {
    try {
      const balances = await get(
        `/cosmos/bank/v1beta1/balances/${address}`
      ).catch(() => ({
        balances: [],
      }));

      const sent = await get(
        `/cosmos/tx/v1beta1/txs?events=message.sender='${address}'&pagination.limit=100`
      ).catch(() => ({
        tx_responses: [],
      }));

      const received = await get(
        `/cosmos/tx/v1beta1/txs?events=transfer.recipient='${address}'&pagination.limit=100`
      ).catch(() => ({
        tx_responses: [],
      }));

      const merged = [
        ...(sent.tx_responses || []),
        ...(received.tx_responses || []),
      ];

      const unique = Array.from(
        new Map(merged.map((tx) => [tx.txhash, tx])).values()
      )
        .map(normalizeTx)
        .sort((a, b) => Number(b.height) - Number(a.height));

      setResult({
        type: "address",
        address,
        balances: balances.balances || [],
        txs: unique,
      });

      setView("result");
    } catch {
      setError("Wallet not found");
    }
  }

  useEffect(() => {
    loadHome();

    const interval = setInterval(() => {
      refreshNewDataOnly();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const latestHeight = status?.result?.sync_info?.latest_block_height || "-";
  const latestTime = status?.result?.sync_info?.latest_block_time || "-";
  const chainId = status?.result?.node_info?.network || "-";
  const nodeName = status?.result?.node_info?.moniker || "-";

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: "linear-gradient(180deg,#060606,#0f1110)",
      }}
    >
      <nav
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{
          background: "rgba(8,8,8,0.85)",
          borderColor: "#222",
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-5 px-6 py-5">
          <div
            className="cursor-pointer"
            onClick={() => {
              setView("home");
              setResult(null);
            }}
          >
            <h1 className="text-3xl font-black" style={{ color: ACCENT }}>
              PAYFISCAN
            </h1>

            <p className="text-sm text-slate-400">Blockchain Explorer</p>
          </div>

          <form
            onSubmit={search}
            className="flex flex-1 overflow-hidden rounded-2xl border shadow-lg"
            style={{
              background: "#111",
              borderColor: "#222",
            }}
          >
            <div className="flex items-center px-4">
              <Search size={18} color={ACCENT} />
            </div>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search block / tx / wallet"
              className="w-full bg-transparent px-3 py-4 text-white outline-none placeholder:text-slate-500"
            />

            <button
              className="px-6 font-bold text-black"
              style={{ background: ACCENT }}
            >
              Search
            </button>
          </form>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}

        {view === "result" && (
          <button
            onClick={() => {
              setView("home");
              setResult(null);
            }}
            className="mb-6 flex items-center gap-2 rounded-xl border bg-[#101010] px-4 py-3"
            style={{ borderColor: "#222" }}
          >
            <ArrowLeft size={18} />
            Back
          </button>
        )}

        {view === "home" && (
          <>
            <section
              className="overflow-hidden rounded-[35px] border p-10"
              style={{
                background: "linear-gradient(145deg,#101010,#151515)",
                borderColor: "#222",
              }}
            >
              <p
                className="mb-4 inline-flex rounded-full px-5 py-2 text-sm font-bold"
                style={{
                  background: "rgba(225,236,134,0.12)",
                  color: ACCENT,
                }}
              >
                LIVE PAYFI NETWORK
              </p>

              <h1 className="text-6xl font-black leading-tight">
                Explore PayFi Blockchain
              </h1>

              <p className="mt-5 max-w-2xl text-lg text-slate-400">
                Live blocks, all scanned transactions, wallet balances, and
                transfers.
              </p>
            </section>

            <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={<Boxes />} title="Latest Block" value={latestHeight} />
              <StatCard icon={<Clock3 />} title="Latest Time" value={formatTime(latestTime)} />
              <StatCard icon={<ShieldCheck />} title="Chain ID" value={chainId} />
              <StatCard icon={<Server />} title="Node" value={nodeName} />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <Panel title="Latest Blocks">
                {blocks.map((b) => (
                  <ExplorerRow
                    key={b.result.block.header.height}
                    onClick={() => openBlock(b.result.block.header.height)}
                  >
                    <div>
                      <h3 className="text-lg font-bold" style={{ color: ACCENT }}>
                        #{b.result.block.header.height}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {formatTime(b.result.block.header.time)}
                      </p>
                    </div>

                    <div className="flex items-center gap-4">
                      <Badge>{b.result.block.data.txs?.length || 0} TXS</Badge>
                      <ChevronRight size={18} />
                    </div>
                  </ExplorerRow>
                ))}
              </Panel>

              <Panel title={`All Transactions (${txs.length})`}>
                {txLoading && (
                  <p className="mb-4 text-sm text-slate-500">
                    Scanning all blocks for transactions...
                  </p>
                )}

                {txs.length ? (
                  txs.map((tx) => (
                    <ExplorerRow key={tx.hash} onClick={() => openTx(tx.hash)}>
                      <div>
                        <h3 className="font-mono text-sm" style={{ color: ACCENT }}>
                          {short(tx.hash)}
                        </h3>

                        <p className="mt-1 text-sm text-slate-500">
                          Block #{tx.height}
                        </p>
                      </div>

                      <Status ok={tx.code === 0} />
                    </ExplorerRow>
                  ))
                ) : (
                  <p className="text-slate-500">No transactions found.</p>
                )}
              </Panel>
            </section>
          </>
        )}

        {view === "result" && result?.type === "block" && (
          <Panel title={`Block #${result.block.result.block.header.height}`}>
            <Info label="Hash" value={result.block.result.block_id.hash} />

            <Info
              label="Time"
              value={formatTime(result.block.result.block.header.time)}
            />

            <Info label="Transactions" value={result.txs.length} />

            <SectionTitle>Transactions</SectionTitle>

            {result.txs.length ? (
              result.txs.map((tx) => (
                <ExplorerRow key={tx.hash} onClick={() => openTx(tx.hash)}>
                  <div>
                    <p className="font-mono text-sm" style={{ color: ACCENT }}>
                      {short(tx.hash)}
                    </p>
                  </div>

                  <Status ok={tx.code === 0} />
                </ExplorerRow>
              ))
            ) : (
              <p className="text-slate-500">No transactions in this block.</p>
            )}
          </Panel>
        )}

        {view === "result" && result?.type === "tx" && (
          <Panel title="Transaction">
            <Info label="Hash" value={result.tx.hash} />
            <Info label="Height" value={result.tx.height} />
            <Info label="Gas Used" value={result.tx.gasUsed} />
            <Info label="Gas Wanted" value={result.tx.gasWanted} />
            <Info label="Timestamp" value={formatTime(result.tx.timestamp)} />

            <SectionTitle>Messages</SectionTitle>
            <CodeBlock data={result.full.tx?.body?.messages || []} />

            <SectionTitle>Events</SectionTitle>
            <CodeBlock data={result.full.tx_response.events} />
          </Panel>
        )}

        {view === "result" && result?.type === "address" && (
          <Panel title="Wallet Details">
            <Info label="Address" value={result.address} />
            <Info label="Transactions" value={result.txs.length} />

            <SectionTitle>Balances</SectionTitle>

            {result.balances.length ? (
              <div className="grid gap-5 md:grid-cols-3">
                {result.balances.map((b, i) => (
                  <div
                    key={i}
                    className="rounded-3xl border bg-[#111] p-6"
                    style={{ borderColor: "#222" }}
                  >
                    <p className="text-sm text-slate-500">TOKEN</p>

                    <h2 className="mt-2 text-2xl font-black" style={{ color: ACCENT }}>
                      {b.denom}
                    </h2>

                    <p className="mt-4 text-2xl font-bold">
                      {Number(b.amount).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p>No balances.</p>
            )}

            <SectionTitle>Transactions</SectionTitle>

            {result.txs.length ? (
              result.txs.map((tx) => (
                <ExplorerRow key={tx.hash} onClick={() => openTx(tx.hash)}>
                  <div>
                    <p className="font-mono text-sm" style={{ color: ACCENT }}>
                      {short(tx.hash)}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Block #{tx.height}
                    </p>
                  </div>

                  <Status ok={tx.code === 0} />
                </ExplorerRow>
              ))
            ) : (
              <p className="text-slate-500">No transactions found.</p>
            )}
          </Panel>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, title, value }) {
  return (
    <div
      className="rounded-[30px] border bg-[#101010] p-6"
      style={{ borderColor: "#222" }}
    >
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{
          background: "rgba(225,236,134,0.12)",
          color: ACCENT,
        }}
      >
        {icon}
      </div>

      <p className="text-sm text-slate-500">{title}</p>
      <h2 className="mt-3 break-all text-3xl font-black">{value}</h2>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div
      className="rounded-[35px] border bg-[#101010] p-6"
      style={{ borderColor: "#222" }}
    >
      <h2 className="mb-6 text-3xl font-black" style={{ color: ACCENT }}>
        {title}
      </h2>

      {children}
    </div>
  );
}

function ExplorerRow({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="mb-3 flex w-full items-center justify-between rounded-2xl border bg-[#151515] p-5 text-left transition hover:scale-[1.01]"
      style={{ borderColor: "#222" }}
    >
      {children}
    </button>
  );
}

function Badge({ children }) {
  return (
    <div
      className="rounded-full px-4 py-2 text-sm font-bold"
      style={{
        background: "rgba(225,236,134,0.12)",
        color: ACCENT,
      }}
    >
      {children}
    </div>
  );
}

function Status({ ok }) {
  return ok ? (
    <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
      <CheckCircle2 size={16} />
      Success
    </div>
  ) : (
    <div className="flex items-center gap-2 rounded-full bg-red-500/10 px-4 py-2 text-sm text-red-400">
      <XCircle size={16} />
      Failed
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="grid gap-4 border-b border-[#222] py-5 md:grid-cols-[220px_1fr]">
      <div className="text-slate-500">{label}</div>
      <code className="break-all text-sm">{value}</code>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="mb-5 mt-10 text-2xl font-black" style={{ color: ACCENT }}>
      {children}
    </h3>
  );
}

function CodeBlock({ data }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute right-4 top-4 rounded-xl border bg-[#151515] px-4 py-2 text-sm"
        style={{ borderColor: "#222" }}
      >
        <div className="flex items-center gap-2">
          <Copy size={14} />
          {copied ? "Copied" : "Copy"}
        </div>
      </button>

      <pre className="overflow-x-auto rounded-3xl border border-[#222] bg-[#151515] p-6 text-xs text-slate-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function short(v) {
  if (!v) return "-";

  return v.length > 24 ? `${v.slice(0, 14)}...${v.slice(-8)}` : v;
}

function formatTime(t) {
  if (!t) return "-";
  return new Date(t).toLocaleString();
}