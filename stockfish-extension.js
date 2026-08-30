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

  async _initWorker() {
    try {
      // Datei selbst herunterladen und als lokalen Blob starten,
      // um Cross-Origin-Beschränkungen beim Worker-Start zu umgehen.
      const url = 'https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js';
      const response = await fetch(url);
      if (!response.ok) {
        console.error('Stockfish: Datei konnte nicht geladen werden', response.status);
        return;
      }
      const code = await response.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);

      this.worker = new Worker(blobUrl);
      this.worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        this.lastLine = line;
        if (line === 'uciok') this.ready = true;
        if (line.startsWith('bestmove')) {
          this.bestMove = line.split(' ')[1] || '';
        }
      };
      this.worker.onerror = (err) => {
        console.error('Stockfish Worker-Fehler:', err.message);
      };
      this.worker.postMessage('uci');
    } catch (err) {
      console.error('Stockfish: Initialisierung fehlgeschlagen', err);
    }
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
        },
        {
          opcode: 'setElo',
          blockType: Scratch.BlockType.COMMAND,
          text: 'setze Spielstärke auf Elo [ELO]',
          arguments: {
            ELO: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1500 }
          }
        }
      ]
    };
  }

  setPosition(args) {
    if (!this.worker) {
      console.warn('Stockfish: Engine noch nicht bereit');
      return;
    }
    const fen = args.FEN;
    this.worker.postMessage(
      fen === 'startpos' ? 'position startpos' : `position fen ${fen}`
    );
  }

  goDepth(args) {
    if (!this.worker) {
      console.warn('Stockfish: Engine noch nicht bereit');
      return Promise.resolve();
    }
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

  setElo(args) {
    if (!this.worker) {
      console.warn('Stockfish: Engine noch nicht bereit');
      return;
    }
    // Begrenzt Elo auf den von Stockfish 10 unterstützten Bereich
    const elo = Math.min(2850, Math.max(1350, Math.round(args.ELO)));
    this.worker.postMessage('setoption name UCI_LimitStrength value true');
    this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
  }
}

Scratch.extensions.register(new StockfishExtension());
