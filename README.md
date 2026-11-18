# Chess trainer

Entrenador personal de ajedrez: importa tus partidas de chess.com, las analiza con Stockfish **en tu propio
dispositivo** y te enseña tus errores para entrenarlos. Sin servidor ni cuentas: tus datos no salen del móvil o PC.

Estado: primera versión web (sincronizar, analizar, ver errores en el tablero). Ver [docs/plan.md](docs/plan.md).

## Usarla
Abre la web publicada en GitHub Pages, escribe tu usuario de chess.com y pulsa *Analizar*. En el móvil, «Añadir a
pantalla de inicio» la instala como app.

## Desarrollo
```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm test
```

La carpeta `trainer/` es una versión en Python para analizar el historial completo en un PC (ver `CLAUDE.md`).

Licencia: GPL-3.0 (usa Stockfish y chessground, ambos GPL-3.0).
