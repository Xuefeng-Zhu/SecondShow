/** Bounded response read; caller supplies a provider timeout via AbortSignal. */
export async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const length=response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length)>maxBytes)) throw new Error('Response too large.');
  const reader=response.body?.getReader(); if (!reader) return '';
  const chunks:Uint8Array[]=[]; let total=0;
  while (true) { const {done,value}=await reader.read(); if(done) break; total+=value.length; if(total>maxBytes) { await reader.cancel(); throw new Error('Response too large.'); } chunks.push(value); }
  const bytes=new Uint8Array(total); let offset=0; for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
