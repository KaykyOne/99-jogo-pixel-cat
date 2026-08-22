# Terreno das plataformas (grama-topo.png / terra-tile.png)

## De onde vêm

Os dois arquivos em `public/assets/florest/` são **gerados**, não desenhados:
`tools/gen-terrain.js` os recorta de `florest/chao-strip.png`, o mesmo
terreno que a fase já usa no chão. Nenhuma arte externa entrou no projeto —
por isso as plataformas combinam com o chão automaticamente.

Para regerar (por exemplo, se `chao-strip.png` for trocado):

```bash
npm i pngjs --no-save && node tools/gen-terrain.js
```

`pngjs` é usado só nessa geração offline, por isso entra com `--no-save` e
não vira dependência do jogo.

## O que cada peça é

| Arquivo | Tamanho | Conteúdo |
| --- | --- | --- |
| `grama-topo.png` | 1774x150 | tufos (linhas 0-52, alpha parcial) + grama densa |
| `terra-tile.png` | 1774x408 | faixa de terra (150-353) + a mesma faixa espelhada |

## Por que a terra é espelhada

Empilhando `[terra][terra invertida]`, a junta do meio encosta a linha 353
nela mesma e a junta da repetição encosta a linha 150 nela mesma. Como as
duas bordas são idênticas, a textura repete na vertical **sem emenda** — que
era o problema em paredes altas, onde a faixa original mostrava um risco
claro a cada repetição.

## Por que a terra para na linha 353

O rodapé de `chao-strip.png` tem lixo do recorte original: a linha **356 é
branco opaco** e as 357-358 são transparentes. Incluir essas linhas fazia o
espelhamento colocar a linha branca exatamente na emenda, atravessando a
parede inteira. O corte em 353 é o que evita isso — não é um número
arbitrário.

Isso também é um aviso: qualquer outro uso de `chao-strip.png` que chegue
até o fim do arquivo vai encontrar a mesma linha branca. O chão da fase não
esbarra nisso porque só desenha 60px a partir do topo (linhas 0-200).

## Como são montadas em jogo

`drawTexturedPlatform()` em `src/game/world/phases.ts` monta cada plataforma
em três partes:

1. **Corpo**: `terra-tile` repetida na área inteira da plataforma.
2. **Capa**: `grama-topo` no topo, posicionada de forma que os tufos fiquem
   **acima** da superfície sólida (fora da caixa de colisão), como vegetação
   passando da borda.
3. **Bordas**: sombra escura de 3px nas laterais e embaixo, fechando o corte
   reto da terra.

A escala é `0.3`, a mesma do chão da fase — manter isso é o que preserva o
tamanho do pixel consistente entre chão e plataforma.

Consequência prática: a capa de grama ocupa 29px abaixo da superfície, então
**superfícies com menos de ~40px de espessura aparecem só verdes**, sem
terra à mostra. Os montes da floresta usam de 90 a 280px, bem acima disso.

O campo `grassCap: false` desliga a capa em superfícies cujo topo já fica
coberto por outra — sem isso as duas capas se sobrepõem no mesmo lugar.
Nenhum monte da floresta precisa disso hoje, mas o campo existe para
degraus encostados uns nos outros.
