from stockfish import Stockfish
import subprocess

execPath='C:\\Users\\nakao\\AppData\\Local\\Programs\\Python\\Python312\\Lib\\site-packages\\stockfish\\stockfish_15_win_x64_avx2\\stockfish_15_x64_avx2.exe'
sf=subprocess.Popen(execPath, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
fen = ''
depth=5
isCheck=False
bestMove=''

def sendUCICommand(cmd:str, sync:bool, printOutput:bool):
    cmd = f'{cmd}\n'
    if sync:
        cmd += 'isready\n'
    sf.stdin.write(cmd)
    sf.stdin.flush()

    while True:
        line = sf.stdout.readline().strip()

        if line.startswith('Fen: '):
            global fen
            fen = line.replace('Fen: ', '')

        if line.startswith('Checkers: '):
            
    
