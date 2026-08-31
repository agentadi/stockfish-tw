// TurboWarp Custom Extension: Stockfish Chess Engine
// WICHTIG: Muss als "unsandboxed" geladen werden (Netzwerk-/Worker-Zugriff nötig)

class StockfishExtension {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.bestMove = '';
    this.lastLine = '';
    this.noLegalMoves = false;
    this.lastCheckers = null;
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
          const move = line.split(' ')[1] || '';
          if (move === '(none)') {
            this.bestMove = '';
            this.noLegalMoves = true;
          } else {
            this.bestMove = move;
            this.noLegalMoves = false;
          }
        }
        if (line.startsWith('Checkers:')) {
          this.lastCheckers = line;
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
          opcode: 'playMove',
          blockType: Scratch.BlockType.COMMAND,
          text: 'berechne Zug mit Elo [ELO]',
          arguments: {
            ELO: { type: Scratch.ArgumentType.STRING, defaultValue: '1500' }
          }
        },
        {
          opcode: 'isGameOver',
          blockType: Scratch.BlockType.BOOLEAN,
          text: 'Spiel vorbei (kein Zug mehr möglich)?'
        },
        {
          opcode: 'getResult',
          blockType: Scratch.BlockType.REPORTER,
          text: 'Ergebnis (schachmatt/patt/offen)'
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

  bestMoveReporter() {
    return this.bestMove;
  }

  isReady() {
    return this.ready;
  }

  rawLine() {
    return this.lastLine;
  }

  playMove(args) {
    if (!this.worker) {
      console.warn('Stockfish: Engine noch nicht bereit');
      return Promise.resolve();
    }

    const eloRaw = String(args.ELO).trim().toLowerCase();

    if (eloRaw === 'max') {
      // Volle Stärke: keine Begrenzung, maximale Suchtiefe
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
      this.worker.postMessage('setoption name Skill Level value 20');
      this.worker.postMessage('go depth 20');
    } else {
      const elo = Math.min(2850, Math.max(1350, Math.round(Number(eloRaw)) || 1500));

      // Skill Level (0-20) und Suchtiefe (3-18) linear aus dem Elo-Wert ableiten
      const ratio = (elo - 1350) / (2850 - 1350);
      const skill = Math.round(ratio * 20);
      const depth = Math.round(3 + ratio * 15);

      this.worker.postMessage('setoption name UCI_LimitStrength value true');
      this.worker.postMessage(`setoption name UCI_Elo value ${elo}`);
      this.worker.postMessage(`setoption name Skill Level value ${skill}`);
      this.worker.postMessage(`go depth ${depth}`);
    }

    // Zug berechnen und warten, bis er fertig ist
    this.bestMove = '';
    return new Promise((resolve) => {
      const check = () => {
        if (this.bestMove) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  isGameOver() {
    return this.noLegalMoves;
  }

  async getResult() {
    if (!this.worker) return '';
    if (!this.noLegalMoves) return 'offen';

    // Frag die Engine per Debug-Kommando "d", ob der König gerade im Schach steht
    this.lastCheckers = null;
    this.worker.postMessage('d');

    await new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (this.lastCheckers !== null || Date.now() - start > 1000) resolve();
        else setTimeout(check, 50);
      };
      check();
    });

    const checkersValue = this.lastCheckers
      ? this.lastCheckers.replace('Checkers:', '').trim()
      : '';

    return checkersValue !== '' ? 'schachmatt' : 'patt';
  }
}

Scratch.extensions.register(new StockfishExtension());
