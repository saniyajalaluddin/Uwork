import hashlib,json,secrets,sqlite3,os
from datetime import date
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).parent; DB=ROOT/'skillquest.db'; S={}
def db():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;return c
def init():
 with db() as c:c.executescript('''CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT,email TEXT UNIQUE,salt TEXT,hash TEXT);CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY,user_id INTEGER,amount REAL,reason TEXT,ref TEXT UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS completions(user_id INTEGER,path TEXT,UNIQUE(user_id,path));CREATE TABLE IF NOT EXISTS claims(user_id INTEGER,day TEXT,UNIQUE(user_id,day));''')
def hp(p,s):return hashlib.scrypt(p.encode(),salt=bytes.fromhex(s),n=16384,r=8,p=1).hex()
class H(SimpleHTTPRequestHandler):
 def log_message(self,*x):pass
 def uid(self):
  x=SimpleCookie(self.headers.get('Cookie')).get('sq');return S.get(x.value) if x else None
 def body(self):return json.loads(self.rfile.read(int(self.headers.get('Content-Length',0)))or'{}')
 def out(self,code,x,cookie=None):
  b=json.dumps(x).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(b)));cookie and self.send_header('Set-Cookie',cookie);self.end_headers();self.wfile.write(b)
 def do_GET(self):
  p=urlparse(self.path).path
  if p=='/api/dashboard':return self.dashboard()
  if p=='/':self.path='/app.html'
  return super().do_GET()
 def do_POST(self):
  p=urlparse(self.path).path
  if p=='/api/register':return self.auth(True)
  if p=='/api/login':return self.auth(False)
  if p=='/api/logout':S.pop(SimpleCookie(self.headers.get('Cookie')).get('sq').value,None) if SimpleCookie(self.headers.get('Cookie')).get('sq') else None;return self.out(200,{'ok':1},'sq=;Max-Age=0;Path=/')
  if p=='/api/complete':return self.complete()
  if p=='/api/game':return self.game()
  self.out(404,{'error':'Not found'})
 def auth(self,new):
  x=self.body();email=x.get('email','').lower().strip();pwd=x.get('password','');name=x.get('name','').strip()
  if new:
   if len(name)<2 or '@' not in email or len(pwd)<8:return self.out(400,{'error':'Use name, valid email and 8+ character password.'})
   salt=secrets.token_hex(16)
   try:
    with db() as c:cur=c.execute('INSERT INTO users(name,email,salt,hash)VALUES(?,?,?,?)',(name,email,salt,hp(pwd,salt)));c.execute('INSERT INTO ledger(user_id,amount,reason,ref)VALUES(?,?,?,?)',(cur.lastrowid,50,'Welcome bonus','welcome:'+str(cur.lastrowid)));u=cur.lastrowid
   except sqlite3.IntegrityError:return self.out(409,{'error':'This email already has an account.'})
  else:
   with db() as c:u=c.execute('SELECT * FROM users WHERE email=?',(email,)).fetchone()
   if not u or not secrets.compare_digest(u['hash'],hp(pwd,u['salt'])):return self.out(401,{'error':'Incorrect email or password.'})
   u=u['id']
  t=secrets.token_urlsafe(32);S[t]=u;self.out(200,{'ok':1},f'sq={t};HttpOnly;SameSite=Lax;Path=/')
 def dashboard(self):
  u=self.uid()
  if not u:return self.out(401,{'error':'Sign in required.'})
  with db() as c:
   user=dict(c.execute('SELECT name,email FROM users WHERE id=?',(u,)).fetchone());bal=c.execute('SELECT COALESCE(SUM(amount),0)n FROM ledger WHERE user_id=?',(u,)).fetchone()['n'];done=[r['path'] for r in c.execute('SELECT path FROM completions WHERE user_id=?',(u,))];hist=[dict(r) for r in c.execute('SELECT amount,reason,created_at FROM ledger WHERE user_id=? ORDER BY id DESC',(u,))];claimed=bool(c.execute('SELECT 1 FROM claims WHERE user_id=? AND day=?',(u,date.today().isoformat())).fetchone())
  self.out(200,{'user':user,'balance':bal,'done':done,'history':hist,'claimed':claimed})
 def complete(self):
  u=self.uid();x=self.body();path=x.get('path');reward=float(x.get('reward',0))
  if not u:return self.out(401,{'error':'Sign in required.'})
  if path not in {'learn-beginner','learn-intermediate','learn-pro','interview-beginner','interview-intermediate','interview-pro','levelup-beginner','levelup-intermediate','levelup-pro'}:return self.out(400,{'error':'Invalid path.'})
  try:
   with db() as c:c.execute('INSERT INTO completions VALUES(?,?)',(u,path));c.execute('INSERT INTO ledger(user_id,amount,reason,ref)VALUES(?,?,?,?)',(u,reward,'Verified learning proof',f'{u}:{path}'))
  except sqlite3.IntegrityError:return self.out(409,{'error':'This proof was already rewarded.'})
  self.out(200,{'ok':1})
 def game(self):
  u=self.uid();day=date.today().isoformat()
  if not u:return self.out(401,{'error':'Sign in required.'})
  try:
   with db() as c:c.execute('INSERT INTO claims VALUES(?,?)',(u,day));c.execute('INSERT INTO ledger(user_id,amount,reason,ref)VALUES(?,?,?,?)',(u,.25,'Daily Signal Sprint',f'game:{u}:{day}'))
  except sqlite3.IntegrityError:return self.out(409,{'error':'Daily reward already claimed.'})
  self.out(200,{'ok':1})
if __name__=='__main__':os.chdir(ROOT);init();print('Open http://localhost:8765');ThreadingHTTPServer(('127.0.0.1',8765),H).serve_forever()
