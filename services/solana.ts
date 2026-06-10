import { BaseDataSource } from '@/services/base';

/** JSON-RPC 2.0 request envelope. */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown[];
}

/** JSON-RPC 2.0 response envelope. */
interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/** Solana's common RPC result wrapper carrying a slot context. */
interface RpcContext<T> {
  context: { slot: number };
  value: T;
}

/** A transaction signature entry from `getSignaturesForAddress`. */
export interface SolanaSignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  memo: string | null;
  blockTime: number | null;
  confirmationStatus?: string;
}

/** A (loosely-typed) confirmed transaction from `getTransaction`. */
export type SolanaTransaction = Record<string, unknown> & {
  slot: number;
  blockTime: number | null;
};

/**
 * Solana JSON-RPC adapter. Talks to any RPC endpoint set via `SOLANA_RPC_URL`.
 * When that URL is absent the service reports unconfigured and calls throw a
 * clear error.
 */
export class SolanaRpcService extends BaseDataSource {
  readonly name = 'solana';
  private rpcId = 0;

  constructor() {
    super(process.env.SOLANA_RPC_URL || '', { 'Content-Type': 'application/json' });
  }

  /** True only when an RPC endpoint URL is configured. */
  isConfigured(): boolean {
    return Boolean(process.env.SOLANA_RPC_URL);
  }

  protected async ping(): Promise<void> {
    await this.getSlot();
  }

  /**
   * Generic JSON-RPC call. Throws if the node returns an `error` object or the
   * service is not configured.
   */
  async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('solana: SOLANA_RPC_URL not configured');
    }
    const body: JsonRpcRequest = { jsonrpc: '2.0', id: ++this.rpcId, method, params };
    const res = await this.request<JsonRpcResponse<T>>({ url: '', method: 'POST', data: body });
    if (res.error) {
      throw new Error(`solana rpc ${method} error ${res.error.code}: ${res.error.message}`);
    }
    return res.result as T;
  }

  /** Current confirmed slot. */
  async getSlot(): Promise<number> {
    return this.rpc<number>('getSlot');
  }

  /** Native SOL balance in lamports for an address (latest commitment). */
  async getBalance(address: string): Promise<number> {
    const res = await this.rpc<RpcContext<number>>('getBalance', [address]);
    return res.value;
  }

  /**
   * Recent transaction signatures involving an address, newest first.
   * @param address Base-58 account address.
   * @param limit Maximum number of signatures to return (default 100).
   */
  async getSignaturesForAddress(address: string, limit = 100): Promise<SolanaSignatureInfo[]> {
    return this.rpc<SolanaSignatureInfo[]>('getSignaturesForAddress', [address, { limit }]);
  }

  /** A parsed, confirmed transaction by signature, or `null` if not found. */
  async getTransaction(sig: string): Promise<SolanaTransaction | null> {
    return this.rpc<SolanaTransaction | null>('getTransaction', [
      sig,
      { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
    ]);
  }
}
