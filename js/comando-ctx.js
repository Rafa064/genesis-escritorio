// Frente "Comando e coordenação": o app.js entrega aqui (uma vez) as funções e o estado que os
// módulos comando-*.js precisam. Tudo é função (lê o valor de agora, nunca uma cópia velha).
export const ctx = {};
export function ligarComando(funcoes) { Object.assign(ctx, funcoes); }

export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const lerJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };
export const guardado = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export const guarda = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const tempoDe = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`; };
export const nomeArq = (p) => String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || '';
