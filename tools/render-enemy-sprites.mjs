// Rasteriza as poses dos inimigos FORA do jogo, para poder OLHAR a arte sem
// abrir o navegador. Existe porque a arte dos inimigos é gerada por código
// (entities/art/), e escrever desenho às cegas não funciona: a primeira versão
// tinha morcego com as asas soltas do corpo e aranha com 2 pernas, e nada
// disso aparece lendo o código.
//
// Uso:
//   npx esbuild src/game/entities/art/spider-art.ts --bundle --format=esm //     --external:phaser --outfile=.tmp/spider-art.mjs
//   node tools/render-enemy-sprites.mjs spider .tmp/spider.png
//
// Simula o mínimo de Phaser.Graphics que os módulos de arte usam. Simula o mínimo de Phaser.Graphics que os módulos de
// arte usam (fillStyle/fillRect/fillCircle/fillTriangle/lineStyle/lineBetween)
// e escreve um PNG por inimigo com todas as poses lado a lado.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const FRAME = 48;
const ZOOM = 7;

// ---------- rasterizador -------------------------------------------------
class Canvas {
    constructor(w, h) {
        this.w = w;
        this.h = h;
        this.px = new Uint8Array(w * h * 4);
    }
    blend(x, y, r, g, b, a) {
        x = Math.floor(x); y = Math.floor(y);
        if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
        const i = (y * this.w + x) * 4;
        const dst = this.px[i + 3] / 255;
        const out = a + dst * (1 - a);
        if (out <= 0) return;
        this.px[i]     = (r * a + this.px[i]     * dst * (1 - a)) / out;
        this.px[i + 1] = (g * a + this.px[i + 1] * dst * (1 - a)) / out;
        this.px[i + 2] = (b * a + this.px[i + 2] * dst * (1 - a)) / out;
        this.px[i + 3] = out * 255;
    }
}

class MockGraphics {
    constructor() {
        this.c = new Canvas(FRAME, FRAME);
        this.col = [255, 255, 255];
        this.alpha = 1;
        this.lineW = 1;
        this.lineCol = [255, 255, 255];
        this.lineAlpha = 1;
    }
    static rgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
    fillStyle(hex, alpha = 1) { this.col = MockGraphics.rgb(hex); this.alpha = alpha; return this; }
    lineStyle(w, hex, alpha = 1) { this.lineW = w; this.lineCol = MockGraphics.rgb(hex); this.lineAlpha = alpha; return this; }
    fillRect(x, y, w, h) {
        for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++)
            for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++)
                this.c.blend(xx, yy, ...this.col, this.alpha);
        return this;
    }
    fillCircle(cx, cy, r) {
        for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++)
            for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
                const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
                if (dx * dx + dy * dy <= r * r) this.c.blend(xx, yy, ...this.col, this.alpha);
            }
        return this;
    }
    fillEllipse(cx, cy, w, h) {
        const rx = w / 2, ry = h / 2;
        for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++)
            for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
                const dx = (xx + 0.5 - cx) / rx, dy = (yy + 0.5 - cy) / ry;
                if (dx * dx + dy * dy <= 1) this.c.blend(xx, yy, ...this.col, this.alpha);
            }
        return this;
    }
    fillRoundedRect(x, y, w, h, r = 4) {
        this.fillRect(x + r, y, w - 2 * r, h);
        this.fillRect(x, y + r, w, h - 2 * r);
        this.fillCircle(x + r, y + r, r); this.fillCircle(x + w - r, y + r, r);
        this.fillCircle(x + r, y + h - r, r); this.fillCircle(x + w - r, y + h - r, r);
        return this;
    }
    fillTriangle(x1, y1, x2, y2, x3, y3) {
        const minX = Math.floor(Math.min(x1, x2, x3)), maxX = Math.ceil(Math.max(x1, x2, x3));
        const minY = Math.floor(Math.min(y1, y2, y3)), maxY = Math.ceil(Math.max(y1, y2, y3));
        const s = (ax, ay, bx, by, px, py) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
        for (let yy = minY; yy <= maxY; yy++)
            for (let xx = minX; xx <= maxX; xx++) {
                const px = xx + 0.5, py = yy + 0.5;
                const d1 = s(x1, y1, x2, y2, px, py), d2 = s(x2, y2, x3, y3, px, py), d3 = s(x3, y3, x1, y1, px, py);
                const neg = (d1 < 0) || (d2 < 0) || (d3 < 0), pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
                if (!(neg && pos)) this.c.blend(xx, yy, ...this.col, this.alpha);
            }
        return this;
    }
    lineBetween(x1, y1, x2, y2) {
        const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2);
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
            const half = this.lineW / 2;
            for (let oy = -half; oy <= half; oy += 0.5)
                for (let ox = -half; ox <= half; ox += 0.5)
                    this.c.blend(x + ox, y + oy, ...this.lineCol, this.lineAlpha);
        }
        return this;
    }
    // arc/beginPath/etc so acumulam path no Phaser: sem strokePath()/fillPath()
    // nada e' desenhado. Stubs no-op reproduzem o mesmo resultado do jogo.
    arc() { return this; }
    beginPath() { return this; }
    closePath() { return this; }
    strokePath() { return this; }
    fillPath() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    strokeTriangle() { return this; }
    strokeCircle() { return this; }
    strokeRect() { return this; }
    clear() { this.c = new Canvas(FRAME, FRAME); return this; }
    generateTexture() { return this; }
    destroy() {}
}

// ---------- PNG ----------------------------------------------------------
function png(w, h, rgba) {
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 4 + 1)] = 0;
        Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
    }
    const crcTable = [...Array(256)].map((_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = buf => {
        let c = 0xffffffff;
        for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td));
        return Buffer.concat([len, td, cr]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
    ]);
}

// ---------- captura das poses -------------------------------------------
const captured = [];
const mockScene = {
    textures: { exists: () => false },
    anims: { exists: () => false, create: () => {} },
    make: {
        graphics() {
            const g = new MockGraphics();
            captured.push(g);
            return g;
        }
    }
};

const which = process.argv[2];
const mod = await import(`${process.cwd().replace(/\/g, '/')}/.tmp/${which}-art.mjs`);
const fn = Object.values(mod).find(v => typeof v === 'function');
fn(mockScene);

// registerEnemyArt gera: 1 textura base + idle + walk + attack, nessa ordem.
const frames = captured.map(g => g.c);
const cols = frames.length;
const sheetW = cols * FRAME * ZOOM + (cols + 1) * 6;
const sheetH = FRAME * ZOOM + 12;
const sheet = new Canvas(sheetW, sheetH);

// Fundo xadrez para enxergar o alpha e a caixa de 48x48.
for (let y = 0; y < sheetH; y++)
    for (let x = 0; x < sheetW; x++) {
        const t = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 62 : 48;
        sheet.blend(x, y, t, t, t + 6, 1);
    }

frames.forEach((f, i) => {
    const ox = 6 + i * (FRAME * ZOOM + 6), oy = 6;
    for (let y = 0; y < FRAME * ZOOM; y++)
        for (let x = 0; x < FRAME * ZOOM; x++) {
            const sx = Math.floor(x / ZOOM), sy = Math.floor(y / ZOOM);
            const si = (sy * FRAME + sx) * 4;
            sheet.blend(ox + x, oy + y, f.px[si], f.px[si + 1], f.px[si + 2], f.px[si + 3] / 255);
        }
    // linha do "chão" do frame (y=48) e do meio, para conferir apoio e centro
    for (let x = 0; x < FRAME * ZOOM; x++) sheet.blend(ox + x, oy + FRAME * ZOOM - 1, 255, 80, 80, 0.7);
});

writeFileSync(process.argv[3], png(sheetW, sheetH, sheet.px));
console.log(`${which}: ${frames.length} frames -> ${process.argv[3]}`);
