// Gera os assets de terreno das plataformas a partir de florest/chao-strip.png.
// Não é arte nova: é o mesmo terreno do chão da fase, recortado em duas peças
// que dá pra repetir sem emenda.
//
//   grama-topo.png -> tufos (linhas 0-52, alpha parcial) + grama densa (ate 150)
//   terra-tile.png -> a faixa de terra ESPELHADA na vertical
//
// Por que espelhar: empilhando [terra][terra invertida], a junta do meio
// encosta a linha 353 nela mesma e a junta da repeticao encosta a linha 150
// nela mesma. Como as duas bordas sao identicas, nao aparece emenda em parede
// nenhuma, por mais alta que seja.
//
// Por que a terra para na linha 353: o rodape do arquivo original tem lixo do
// recorte (a linha 356 e BRANCO OPACO, as 357-358 sao transparentes). Incluir
// isso fazia a emenda do espelhamento virar um risco claro atravessando a
// parede.
//
// Uso:  npm i pngjs --no-save  &&  node tools/gen-terrain.js
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ASSETS = path.join(__dirname, '..', 'public', 'assets', 'florest');
const SRC = PNG.sync.read(fs.readFileSync(path.join(ASSETS, 'chao-strip.png')));

const GRASS_H = 150;
const DIRT_TOP = 150;
const DIRT_BOTTOM = 354;
const DIRT_H = DIRT_BOTTOM - DIRT_TOP;

function copyRow(dst, dstY, srcY) {
    for (let x = 0; x < SRC.width; x++) {
        const si = (SRC.width * srcY + x) << 2;
        const di = (dst.width * dstY + x) << 2;
        for (let c = 0; c < 4; c++) {
            dst.data[di + c] = SRC.data[si + c];
        }
    }
}

const grass = new PNG({ width: SRC.width, height: GRASS_H });
for (let y = 0; y < GRASS_H; y++) {
    copyRow(grass, y, y);
}
fs.writeFileSync(path.join(ASSETS, 'grama-topo.png'), PNG.sync.write(grass));

const dirt = new PNG({ width: SRC.width, height: DIRT_H * 2 });
for (let y = 0; y < DIRT_H; y++) {
    copyRow(dirt, y, DIRT_TOP + y);
}
for (let y = 0; y < DIRT_H; y++) {
    copyRow(dirt, DIRT_H + y, DIRT_BOTTOM - 1 - y);
}
fs.writeFileSync(path.join(ASSETS, 'terra-tile.png'), PNG.sync.write(dirt));

console.log('grama-topo.png', SRC.width + 'x' + GRASS_H);
console.log('terra-tile.png', SRC.width + 'x' + DIRT_H * 2);
