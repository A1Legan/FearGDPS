import fs from "node:fs";
import path from "node:path";

import { TextChannel, Message } from "discord.js";

import { TicketRecord } from "../../../utils/ticketStore";

// Отдельная папка под HTML-транскрипты тикетов.
export const TRANSCRIPT_DIR = path.join(process.cwd(), "data", "transcripts");

export function transcriptPath(publicId: string): string {
    return path.join(TRANSCRIPT_DIR, `${publicId}.html`);
}

export function transcriptExists(publicId: string): boolean {
    return fs.existsSync(transcriptPath(publicId));
}

const CATEGORY_LABEL: Record<string, string> = {
    report: "Жалоба",
    question: "Вопрос",
    bug: "Техническая проблема",
    appeal: "Апелляция",
};

function esc(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fmtDate(ms: number): string {
    return new Date(ms).toLocaleString("ru-RU");
}

/** Считывает все сообщения канала (без ботов), от старых к новым. */
async function fetchAllMessages(channel: TextChannel): Promise<Message[]> {
    const all: Message[] = [];
    let before: string | undefined;
    for (;;) {
        const batch = await channel.messages
            .fetch({ limit: 100, ...(before ? { before } : {}) })
            .catch(() => null);
        if (!batch || batch.size === 0) break;
        all.push(...batch.values());
        before = batch.last()!.id;
        if (batch.size < 100) break;
    }
    return all.reverse().filter((m) => !m.author.bot);
}

/** Текст сообщения → безопасный HTML. Ссылки на tenor заменяем заглушкой гифки. */
function formatContent(raw: string): string {
    if (!raw) return "";
    if (raw.trim().toLowerCase().startsWith("https://tenor.com")) {
        return "какая-то гифка :\\";
    }
    return esc(raw).replace(/\n/g, "<br>");
}

/** Рендер вложений сообщения (или пересланного снапшота). */
function renderAttachments(atts: Iterable<{ contentType: string | null; url: string; name: string }>): string {
    return [...atts]
        .map((a) => {
            const isImg = (a.contentType ?? "").startsWith("image/");
            return isImg
                ? `<img class="att" src="${esc(a.url)}" alt="вложение">`
                : `<a class="file" href="${esc(a.url)}" target="_blank">${esc(a.name)}</a>`;
        })
        .join("");
}

function renderMessage(msg: Message, ownerId: string): string {
    const avatar = msg.author.displayAvatarURL({ extension: "png", size: 64 });
    const name = esc(msg.author.username);
    const time = fmtDate(msg.createdTimestamp);
    const content = formatContent(msg.content ?? "");
    const roleClass = msg.author.id === ownerId ? "owner" : "staff";
    const edited = msg.editedTimestamp
        ? ` <span class="edited">(изменено)</span>`
        : "";

    const attachments = renderAttachments(msg.attachments.values());

    // Пересланные сообщения приходят пустыми, а их содержимое лежит в snapshots.
    const snapshots = (msg as unknown as { messageSnapshots?: Map<string, any> })
        .messageSnapshots;
    let forwarded = "";
    if (snapshots && snapshots.size) {
        forwarded = [...snapshots.values()]
            .map((s) => {
                const fc = formatContent(s?.content ?? "");
                const fa = s?.attachments
                    ? renderAttachments(s.attachments.values())
                    : "";
                return `<div class="forward"><div class="forward-label">↪ Пересланное сообщение</div>${
                    fc ? `<div class="bubble">${fc}</div>` : ""
                }${fa ? `<div class="atts">${fa}</div>` : ""}</div>`;
            })
            .join("");
    }

    return `
    <div class="msg">
      <img class="avatar" src="${esc(avatar)}">
      <div class="body">
        <div class="head"><span class="name ${roleClass}">${name}</span><span class="time">${time}</span>${edited}</div>
        ${content ? `<div class="bubble">${content}</div>` : ""}
        ${forwarded}
        ${attachments ? `<div class="atts">${attachments}</div>` : ""}
      </div>
    </div>`;
}

/**
 * Генерирует HTML-транскрипт тикета и сохраняет его в data/transcripts/<ID>.html.
 * Возвращает путь к файлу.
 */
export async function generateTranscript(
    channel: TextChannel,
    ticket: TicketRecord
): Promise<string> {
    if (!fs.existsSync(TRANSCRIPT_DIR)) {
        fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    }

    const messages = await fetchAllMessages(channel);
    const body = messages.map((m) => renderMessage(m, ticket.ownerId)).join("\n");

    const owner = await channel.client.users
        .fetch(ticket.ownerId)
        .catch(() => null);
    const ownerName = owner ? esc(owner.username) : ticket.ownerId;
    const ownerAvatar = owner
        ? owner.displayAvatarURL({ extension: "png", size: 128 })
        : "https://cdn.discordapp.com/embed/avatars/0.png";

    const ratingText =
        ticket.rating !== null ? `${ticket.rating} / 5` : "без оценки";
    const category = esc(CATEGORY_LABEL[ticket.category] ?? ticket.category);

    const html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Тикет ${esc(ticket.publicId)}</title>
<style>
  :root { --text:#eef0f4; --muted:#a2a6b4; --violet:#b7a6ff; }
  * { box-sizing:border-box; }
  body {
    margin:0; padding:52px 20px 40px; color:var(--text);
    font-family:"Segoe UI",Inter,Arial,sans-serif;
    /* Радиальный фиолетовый градиент вместо картинки. */
    background: radial-gradient(circle at 50% 0%, #3a1d6e 0%, #1a1030 55%, #0b0b12 100%) fixed;
  }
  .wrap { max-width:820px; margin:0 auto; }

  .glass {
    background:rgba(255,255,255,.06);
    backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
    border:1px solid rgba(255,255,255,.12);
    border-radius:18px; box-shadow:0 8px 40px rgba(0,0,0,.35);
  }

  .title { text-align:center; font-size:40px; font-weight:800; color:#fff; margin:0 0 4px; }
  .subtitle { text-align:center; color:var(--muted); font-size:14px; margin-bottom:26px; }
  .subtitle b {
    color:var(--violet); font-weight:700;
    background:rgba(183,166,255,.14); border:1px solid rgba(183,166,255,.28);
    padding:2px 9px; border-radius:8px; margin-left:4px;
  }

  .hero { padding:18px 22px; margin-bottom:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .hero img { width:52px; height:52px; border-radius:50%; border:1px solid rgba(255,255,255,.2); }
  .hero .who { flex:1; min-width:160px; }
  .hero .who b { color:#fff; font-size:16px; }
  .hero .who span { color:var(--muted); font-size:13px; }
  .hero .meta { display:flex; gap:18px; flex-wrap:wrap; color:var(--muted); font-size:13px; }
  .hero .meta b { color:var(--text); }

  .panel { padding:18px 20px; }
  .log { display:flex; flex-direction:column; gap:4px; }
  .msg { display:flex; gap:12px; padding:8px; border-radius:12px; }
  .avatar { width:38px; height:38px; border-radius:50%; flex-shrink:0; margin-top:2px; }
  .name { font-weight:700; }
  .name.owner { color:#fff; }
  .name.staff { color:var(--violet); }
  .time { color:var(--muted); font-size:12px; margin-left:8px; }
  .edited { color:var(--muted); font-size:11px; opacity:.7; }
  .bubble { display:inline-block; margin-top:3px; opacity:.8;
            font-size:15px; line-height:1.45; white-space:pre-wrap; word-break:break-word; }
  .forward { margin-top:3px; padding-left:10px; border-left:2px solid rgba(183,166,255,.45); }
  .forward-label { color:var(--muted); font-size:12px; margin-bottom:2px; }
  .atts { margin-top:6px; }
  .att { max-width:400px; border-radius:12px; display:block; margin:6px 0; }
  .file { color:var(--violet); text-decoration:none; }
  .empty { color:var(--muted); text-align:center; padding:16px; }
  .foot { text-align:center; color:var(--muted); font-size:12px; margin-top:20px; }
</style></head>
<body><div class="wrap">
  <h1 class="title">${category}</h1>
  <div class="subtitle">Тикет <b>${esc(ticket.publicId)}</b></div>

  <div class="glass hero">
    <img src="${ownerAvatar}">
    <div class="who"><b>${ownerName}</b><br><span>автор обращения</span></div>
    <div class="meta">
      <div>Оценка: <b>${ratingText}</b></div>
      <div>Сообщений: <b>${messages.length}</b></div>
      <div>Создан: <b>${fmtDate(ticket.createdAt)}</b></div>
      <div>Закрыт: <b>${ticket.closedAt ? fmtDate(ticket.closedAt) : "—"}</b></div>
    </div>
  </div>

  <div class="glass panel">
    <div class="log">
      ${body || '<div class="empty">В обращении не было сообщений от участников.</div>'}
    </div>
  </div>
</div></body></html>`;

    const file = transcriptPath(ticket.publicId);
    fs.writeFileSync(file, html, "utf-8");
    return file;
}
