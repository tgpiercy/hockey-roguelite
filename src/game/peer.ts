import online from '../data/online.json';
import { packCode, unpackCode } from './joinCode';
import { cutSure, joinSure, type Wire } from './wire';

/**
 * Two browsers joined directly (WebRTC, built into the browser), with the first handshake carried by hand:
 * the host's device makes a code, the guest's answers with another. No server of ours is involved.
 * With no addresses under `iceServers` in `online.json` the two must be on the same network.
 */
export interface Link {
  /** The code to give the other device. */
  code: string;
  wire: Wire;
  /** Settles when the two are joined; fails if they cannot be. */
  joined: Promise<void>;
}

export interface HostLink extends Link {
  /** The guest's code, pasted in. False if it is not a code of ours. */
  accept(answer: string): Promise<boolean>;
}

function build(): { pc: RTCPeerConnection; wire: Wire; joined: Promise<void> } {
  const pc = new RTCPeerConnection({ iceServers: (online.iceServers as string[]).map((urls) => ({ urls })) });
  // Both sides open the same two lines by number, so neither waits to be told of them.
  const fast = pc.createDataChannel('fast', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
  const sure = pc.createDataChannel('sure', { negotiated: true, id: 1 });
  fast.binaryType = 'arraybuffer';
  let closed = false;
  const wire: Wire = {
    onFast: null,
    onSure: null,
    onClosed: null,
    sendFast: (data) => {
      if (fast.readyState !== 'open') return;
      try {
        fast.send(data as never);
      } catch {
        // A full line drops the message: the next one says it again.
      }
    },
    sendSure: (text) => {
      if (sure.readyState !== 'open') return;
      try {
        for (const piece of cutSure(text)) sure.send(piece);
      } catch {
        end();
      }
    },
    close: () => {
      closed = true;
      pc.close();
    },
  };
  const end = (): void => {
    if (closed) return;
    closed = true;
    pc.close();
    wire.onClosed?.();
  };
  const whole = joinSure();
  fast.onmessage = (e) => {
    if (e.data instanceof ArrayBuffer) wire.onFast?.(new Uint8Array(e.data));
  };
  sure.onmessage = (e) => {
    const text = typeof e.data === 'string' ? whole(e.data) : null;
    if (text !== null) wire.onSure?.(text);
  };
  const joined = new Promise<void>((resolve, reject) => {
    let open = 0;
    const opened = (): void => {
      open += 1;
      if (open === 2) resolve();
    };
    fast.onopen = opened;
    sure.onopen = opened;
    pc.onconnectionstatechange = () => {
      // A line that wavers ("disconnected") may come back by itself; one that has failed or closed will not.
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        reject(new Error(pc.connectionState));
        end();
      }
    };
    sure.onclose = end;
  });
  joined.catch(() => undefined);
  return { pc, wire, joined };
}

/** The description with every address the device can be reached at: waits for them to be found, but not for ever. */
async function described(pc: RTCPeerConnection): Promise<string> {
  if (pc.iceGatheringState !== 'complete') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, online.gatherSeconds * 1000);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
  }
  return packCode(pc.localDescription?.sdp ?? '');
}

/** Whether this browser can do it at all. */
export function canLink(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/** The host's side: a code to hand over, and a place to put the one that comes back. */
export async function hostLink(): Promise<HostLink> {
  const { pc, wire, joined } = build();
  await pc.setLocalDescription(await pc.createOffer());
  const code = await described(pc);
  return {
    code,
    wire,
    joined,
    accept: async (answer) => {
      const sdp = await unpackCode(answer);
      if (!sdp) return false;
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The guest's side: takes the host's code and makes the one to send back; null if the host's is not a code of ours. */
export async function guestLink(offer: string): Promise<Link | null> {
  const sdp = await unpackCode(offer);
  if (!sdp) return null;
  const { pc, wire, joined } = build();
  try {
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
  } catch {
    pc.close();
    return null;
  }
  return { code: await described(pc), wire, joined };
}
