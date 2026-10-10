# SeymaTV v3

Dark/gothic watch-party starter.

## Kurulum
### 1) Server
```powershell
cd server
npm.cmd install
node server.js
```
Server: http://localhost:3001

### 2) Client
Yeni terminal:
```powershell
cd client
npm.cmd install
npm.cmd run dev
```
Client: http://localhost:5173

## Özellikler
- Oda oluşturma / kodla katılma
- Socket.IO gerçek zamanlı chat
- WebRTC mikrofon
- WebRTC ekran paylaşımı: video ve seçilirse sistem/medya sesi diğer katılımcılara gönderilir
- YouTube IFrame Player
- YouTube play/pause senkronu
- Profil fotoğrafı
- Koyu gotik arayüz

## Notlar
Tarayıcı izinleri ve NAT/firewall koşulları WebRTC'yi etkileyebilir. Yerel testte iki sekmede çalışır.
Ekran paylaşımı için tarayıcının "Ekran / Pencere / Sekme" seçimini yap. Sistem sesi yalnızca tarayıcı ve işletim sistemi izin verirse yakalanır.
X-Frame-Options, CSP, DRM veya başka erişim kısıtları bypass edilmez. Desteklenmeyen sitelerde ekran paylaşımı kullanılabilir.
