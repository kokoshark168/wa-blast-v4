'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsChannel, WsMessage } from '@/types';

interface UseWebSocketOptions {
  channels: WsChannel[];
  onMessage?: (msg: WsMessage) => void;
}

/**
 * Subscribes to the AlphaFlow real-time hub. Auto-reconnects with backoff
 * and re-subscribes to the requested channels on every (re)connect.
 */
export function useWebSocket({ channels, onMessage }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>();
  const attemptsRef = useRef(0);
  const disposedRef = useRef(false);

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    const base = process.env.NEXT_PUBLIC_WS_URL || `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}`;
    const socket = new WebSocket(`${base}/ws`);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      attemptsRef.current = 0;
      channels.forEach((channel) =>
        socket.send(JSON.stringify({ action: 'subscribe', channel }))
      );
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        setLastMessage(msg);
        onMessage?.(msg);
      } catch {
        /* ignore malformed */
      }
    };

    socket.onclose = () => {
      setConnected(false);
      // Never schedule a reconnect after the hook unmounts.
      if (disposedRef.current) return;
      const delay = Math.min(1000 * 2 ** attemptsRef.current, 15_000);
      attemptsRef.current += 1;
      reconnectRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => socket.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(channels)]);

  useEffect(() => {
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, [connect]);

  return { connected, lastMessage };
}
