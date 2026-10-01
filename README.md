# AI Chat — Vercel Free

Project ini sudah disiapkan untuk Vercel Serverless.

## File
- `index.html` — frontend AI Chat.
- `api/chat.js` — endpoint `POST /api/chat`.
- `vercel.json` — konfigurasi Vercel.
- `package.json` — metadata project.
- `.env` — SESSION_SECRET yang dibuat khusus untuk project ini.

## Environment Variable

Nama:
`SESSION_SECRET`

Nilai yang dibuat:
`ESir_Osd9dyqyWqHFl1tjPDRdQg0sCJ8m5acAZUy4BnkfoEJVlkhqcqBbxb19nU9`

Jika deploy melalui Vercel Dashboard, masukkan nilai tersebut di:
Project Settings → Environment Variables → `SESSION_SECRET`

**Jangan membagikan nilai SESSION_SECRET ke publik setelah deployment.**

## Endpoint

Frontend memanggil:
`POST /api/chat`

Body:
`{"message":"Halo"}`

Response:
`{"success":true,"answer":"...","chatId":"..."}`

## Catatan

Backend asli menggunakan `http.createServer()` dan `Map()` untuk session. Pada Vercel Serverless, state proses tidak dijamin tetap hidup, sehingga versi ini menyimpan state auth session di cookie yang ditandatangani.

Endpoint upstream pada script asli adalah endpoint internal ChatGPT Android dan dapat berubah sewaktu-waktu.
