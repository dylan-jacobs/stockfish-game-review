const board = Chessboard('board1', 
    {
        position:'start', 
        draggable:true,
        showErrors: 'console',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
});
const chess = new Chess();
const stockfish = new Worker('stockfish.js');


let history = [];
let fens = [];
let currentMoveIndex = 0;
let lastEval = '';
let lastSavedEval = '';
let stockfishReady = false;
let depth = localStorage.getItem('analysisDepth') || 14;
let evaluations = [];


const canvas = document.getElementById('canvas-chessboard');
const depthSlider = document.getElementById('depth-slider');
const depthLabel = document.getElementById('depth-label');
depthSlider.value = depth;
depthLabel.textContent = `Depth: ${depthSlider.value}`;

const boardSize = 500;
canvas.width = boardSize;
canvas.height = boardSize;

const pgnInput = document.getElementById('input-pgn');
const loadPGNButton = document.getElementById('btn-load-pgn');

// handle received messages from Stockfish
stockfish.onmessage = (event) => {
    const message = event.data;

    if (message === 'uciok'){
        // Set UCI options BEFORE isready
        stockfish.postMessage('setoption name Threads value 4');
        stockfish.postMessage('setoption name Hash value 128');
        stockfish.postMessage('setoption name MultiPV value 1');
        stockfish.postMessage('isready');
        return;
    }
    else if (message === 'isreadyok'){
        stockfishReady = true;
        console.log('Stockfish ready!');
        return;
    }

    //console.log('Stockfish:', message);

    if (message.startsWith('info') && message.includes('score')){
        const mateMatch = message.match(/score mate (-?\d+)/);
        const cpMatch   = message.match(/score cp (-?\d+)/);


        if (mateMatch) {
            lastEval = {type: 'mate', value: parseInt(mateMatch[1])};
        }
        else if (cpMatch) {
            lastEval = {type: 'cp', value: parseInt(cpMatch[1])};
        }
    }
    else if (message.startsWith('bestmove')) {
        if (!lastEval) return;

        const bestMove = message.split(' ')[1];
        console.log('Best move: ', bestMove);
                
        updateMoveInfo(bestMove);
        updateEvalBar(lastEval);
        showSpinner(false);
    };
};

stockfish.postMessage('uci'); // init

// load PGN from cache if exists
loadPGNFromCache();

document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') {
        nextMove();
    }
    else if (event.key === 'ArrowLeft') {
        prevMove();
    }
    else if (event.key === 'Enter') {
        loadPGN();
    }
});

depthSlider.addEventListener('input', (event) => {
    depth = parseInt(event.target.value);
    depthLabel.textContent = `Depth: ${depth}`;
    updateStockfish();
    localStorage.setItem('analysisDepth', depth);
})

function loadPGN() {
    const raw = pgnInput.value;
    
    const pgn = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

    let cleaned = pgn.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    // ensure blank line between headers and moves
    cleaned = cleaned.replace(/(\])\n([^\[])/g, '$1\n\n$2');

    // append * if no result token
    if (!/(\*|1-0|0-1|1\/2-1\/2)\s*$/.test(cleaned)) {
        cleaned += ' *';
    }

    if (chess.load_pgn(cleaned)){
        console.log('PGN loaded successfully');
        savePGNToCache();

        history = chess.history({verbose: true});
        chess.reset();
        fens = [];
        fens.push(chess.fen()); // push initial position
        history.forEach(move => {
            chess.move(move);
            fens.push(chess.fen()); // push next position
        });
        resetGame();
        updateMoveList();
    }
    else{
        console.error('Failed to load PGN');
        console.log(pgn);
    }
}

function savePGNToCache(){
    const pgn = chess.pgn();
    localStorage.setItem('cachedPGN', pgn);
}

function loadPGNFromCache() {
    const cachedPGN = localStorage.getItem('cachedPGN');
    if (cachedPGN) {
        pgnInput.value = cachedPGN;
        loadPGN();
    }
}

function resetGame(){
    currentMoveIndex = 0;
    board.position(fens[0]);
    updateStockfish();
}

function updateBoard() {
    board.position(fens[currentMoveIndex]);
    updateStockfish();
}

function nextMove() {
    if (history.length === 0) return;
    if (currentMoveIndex < history.length){
        currentMoveIndex++;
        updateBoard();
    }
}

function prevMove() {
    if (history.length === 0) return;
    if (currentMoveIndex > 0){
        currentMoveIndex--;
        updateBoard();
    }
}

function updateStockfish() {
    console.log('Analyzing move', currentMoveIndex, ':', fens[currentMoveIndex]);
    lastEval = null;
    showSpinner(true);
    stockfish.postMessage('stop'); // stop current search
    stockfish.postMessage('position fen ' + fens[currentMoveIndex]);
    stockfish.postMessage('go depth ' + depth);
}

function updateEvalBar(evaluation) {

    if (currentMoveIndex < 0 || currentMoveIndex >= fens.length) return;

    const evalBar = document.getElementById('eval-white');
    const evalText = document.getElementById('p-eval-text');

    const type = evaluation.type;
    const rawValue = evaluation.value;

    const currentFen = fens[currentMoveIndex];
    const sideToMove = currentFen.split(' ')[1]; // 'w' for white, 'b' for black
    
    // Flip evaluation for Black's turn to match chess.com convention
    // (positive = White winning, negative = Black winning)
    const value = sideToMove === 'b' ? -rawValue : rawValue;

    if (evaluations.length <= currentMoveIndex) {
        evaluations.push(value);
    } else{
        evaluations[currentMoveIndex] = value;
    }

    //console.log('Updating eval bar: ', type, rawValue, '->', value, '(side to move:', sideToMove + ')');

    if (type === 'cp'){
        const clamped = (Math.max(-1000, Math.min(1000, value)));
        const pct = 50 + 50*(clamped / 1000);
        evalBar.style.height = pct + '%';

        const evalString = (value / 100).toFixed(1);
        evalText.textContent = evalString;

    }
    else if (type === 'mate'){
        const evalString = value > 0 ? `+M${value}` : `-M${Math.abs(value)}`;
        evalText.textContent = evalString;
        evalBar.style.height = value > 0 ? '100%' : '0%';
    }
}

function updateMoveInfo(bestMove) {
    const currentMoveText = document.getElementById('p-current-move');
    const bestMoveText = document.getElementById('p-best-move');

    // show arrow
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fromSquare = bestMove.slice(0, 2);
    const toSquare = bestMove.slice(2, 4);
    const fromCoords = squareToCoords(fromSquare);
    const toCoords = squareToCoords(toSquare);
    drawArrow(ctx, fromCoords, toCoords, color='rgba(0, 255, 0, 0.65)');

    // compute move classification
    const currentFen = fens[currentMoveIndex - 1];
    const sideToMove = currentFen.split(' ')[1]; // 'w' for white, 'b' for black
    let deltaEval = (evaluations[currentMoveIndex - 2] || 0) - (evaluations[currentMoveIndex - 3] || 0);
    console.log('Current turn: ', sideToMove, 'Delta: ', deltaEval);
    let moveColor = 'rgba(0, 255, 0, 0.85)';
    if (sideToMove === 'b') {
        if (deltaEval > 300) { // blunder
            moveColor = 'rgba(255, 0, 0, 0.85)';
        } else if (deltaEval > 50) {
            moveColor = 'rgba(255, 165, 0, 0.85)'; // mistake
        } else if (deltaEval > 20) { 
            moveColor = 'rgba(217, 250, 0, 0.85)'; // inaccuracy
        } else {
            moveColor = 'rgba(6, 183, 0, 0.85)'; // good
        }
    }
    else if (sideToMove === 'w') {
        if (deltaEval < -300) { // blunder
            moveColor = 'rgba(255, 0, 0, 0.85)';
        } else if (deltaEval < -50) {
            moveColor = 'rgba(255, 165, 0, 0.85)'; // inaccuracy
        } else if (deltaEval < -20) {
            moveColor = 'rgba(217, 250, 0, 0.85)'; // inaccuracy
        } else {
            moveColor = 'rgba(6, 183, 0, 0.85)'; // good
        }
    }
    drawMarker(ctx, history[currentMoveIndex - 1].to, color=moveColor);

    const bestMoveSAN = fens[currentMoveIndex] ? uciToSAN(fens[currentMoveIndex], bestMove) : 'N/A';

    currentMoveText.textContent = `Current move: ${history[currentMoveIndex].san}`;
    bestMoveText.textContent = `Best move: ${bestMoveSAN}`;
}

function updateMoveList() {
    const moveListTableBody = document.querySelector('.scrolldown tbody');
    moveListTableBody.innerHTML = ''; // clear existing moves

    for (let i = 0; i < history.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = history[i] ? history[i].san : '';
        const blackMove = history[i + 1] ? history[i + 1].san : '';

        let row = document.createElement('tr');
        let moveCell = document.createElement('td');
        let whiteCell = document.createElement('td');
        let blackCell = document.createElement('td');
        moveCell.textContent = `${moveNumber}.`;
        whiteCell.textContent = whiteMove;
        blackCell.textContent = blackMove;
        row.appendChild(moveCell);
        row.appendChild(whiteCell);
        row.appendChild(blackCell);
        moveListTableBody.appendChild(row);
    }
}

function uciToSAN(fen, uciMove) {
    const temp = new Chess(fen);
    const move = temp.move({
        from: uciMove.slice(0, 2),
        to: uciMove.slice(2, 4),
        promotion: uciMove.length > 4 ? uciMove[4] : undefined
    });
    return move ? move.san : null;
}

function squareToCoords(square, flipped=false) {
    const files = 'abcdefgh';

    const file = files.indexOf(square[0]);
    const rank = parseInt(square[1]) - 1;

    const squareSize = boardSize / 8;

    const col = flipped ? 7 - file : file;
    const row = flipped ? rank : 7 - rank;

    return {
        x: col * squareSize + squareSize / 2,
        y: row * squareSize + squareSize / 2
    };
}

function drawArrow(ctx, from, to, color='rgba(0, 255, 0, 0.65)') {

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    const headLength = 20;
    const length = Math.sqrt(dx * dx + dy * dy);
    const arrowLength = length - headLength*2;
    const endX = from.x + arrowLength * Math.cos(angle);
    const endY = from.y + arrowLength * Math.sin(angle);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';

    // line
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // arrowhead
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - headLength * Math.cos(angle - Math.PI / 2), endY - headLength * Math.sin(angle - Math.PI / 2));
    ctx.lineTo(to.x, to.y);
    ctx.lineTo(endX + headLength * Math.cos(angle - Math.PI / 2), endY + headLength * Math.sin(angle - Math.PI / 2));
    ctx.fillStyle = color;
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawMarker(ctx, square, color='rgba(255, 0, 0, 0.85)'){
    const coords = squareToCoords(square);
    const squareSize = boardSize / 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(coords.x + (squareSize / 2) - 10, coords.y + (squareSize / 2) - 10, 10, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.closePath();
    ctx.restore();
}

function showSpinner(show) {
    const spinner = document.getElementById('spinner');
    spinner.style.display = show ? 'block' : 'none';
}