// TurboWarp Custom Extension: Stockfish Chess Engine
// WICHTIG: Muss als "unsandboxed" geladen werden (Netzwerk-/Worker-Zugriff nötig)

class StockfishExtension {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.bestMove = '';
    this.lastLine = '';
    this._initWorker();
  }

  _initWorker() {
    // Öffentliches CDN mit CORS-Support. Bei Bedarf durch eigenen Host ersetzen.
    this.worker = new Worker(
      'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js'
    );
    this.worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';
      this.lastLine = line;
      if (line === 'uciok') this.ready = true;
      if (line.startsWith('bestmove')) {
        this.bestMove = line.split(' ')[1] || '';
      }
    };
    this.worker.postMessage('uci');
  }

  getInfo() {
    return {
      id: 'stockfish',
      name: 'Stockfish',
      blocks: [
        {
          opcode: 'setPosition',
          blockType: Scratch.BlockType.COMMAND,
          text: 'setze Stellung (FEN oder "startpos") [FEN]',
          arguments: {
            FEN: { type: Scratch.ArgumentType.STRING, defaultValue: 'startpos' }
          }
        },
        {
          opcode: 'goDepth',
          blockType: Scratch.BlockType.COMMAND,
          text: 'berechne besten Zug, Tiefe [DEPTH]',
          arguments: {
            DEPTH: { type: Scratch.ArgumentType.NUMBER, defaultValue: 15 }
          }
        },
        {
          opcode: 'bestMoveReporter',
          blockType: Scratch.BlockType.REPORTER,
          text: 'bester Zug'
        },
        {
          opcode: 'isReady',
          blockType: Scratch.BlockType.BOOLEAN,
          text: 'Engine bereit?'
        },
        {
          opcode: 'rawLine',
          blockType: Scratch.BlockType.REPORTER,
          text: 'letzte Engine-Ausgabe'
        }
      ]
    };
  }

  setPosition(args) {
    const fen = args.FEN;
    this.worker.postMessage(
      fen === 'startpos' ? 'position startpos' : `position fen ${fen}`
    );
  }

  goDepth(args) {
    this.bestMove = '';
    this.worker.postMessage(`go depth ${Math.max(1, Math.round(args.DEPTH))}`);
    // Block wartet, bis ein Zug berechnet wurde (Scratch erlaubt Promises)
    return new Promise((resolve) => {
      const check = () => {
        if (this.bestMove) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  bestMoveReporter() {
    return this.bestMove;
  }

  isReady() {
    return this.ready;
  }

  rawLine() {
    return this.lastLine;
  }
}

Scratch.extensions.register(new StockfishExtension());
