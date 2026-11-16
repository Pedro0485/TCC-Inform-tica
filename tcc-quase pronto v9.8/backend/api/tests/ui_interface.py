"""Teste de INTERFACE (Chromium headless via Playwright) do fluxo de importação e das animações.

Pré-requisitos: banco de teste (DB_NAME com "test") com migração aplicada, Tesseract+Python,
`pip install playwright` e um Chromium instalado. Uso (na pasta backend, com as variáveis do .env):
    python3 api/tests/ui_interface.py
Os CDNs (SweetAlert2, ícones) são substituídos por stubs, para rodar sem internet.
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PDF = os.path.join(BACKEND, "python", "tests", "fixtures", "horario_tarde.pdf")
SHOTS = os.environ.get("SHOTS_DIR", tempfile.mkdtemp())
PORT = 3997
BASE = f"http://127.0.0.1:{PORT}"
falhas, ok = [], 0


def checar(cond, msg):
    global ok
    if cond: ok += 1; print("  PASS", msg)
    else: falhas.append(msg); print("  FAIL", msg)


def sql(q):
    return subprocess.run(["mariadb", "-N", os.environ["DB_NAME"], "-e", q], capture_output=True, text=True).stdout.strip()


assert "test" in os.environ["DB_NAME"].lower(), "só roda em banco de teste"
sql("SET FOREIGN_KEY_CHECKS=0; TRUNCATE aulas_professores; TRUNCATE aulas; TRUNCATE importacoes_horarios; TRUNCATE turmas; TRUNCATE professores; SET FOREIGN_KEY_CHECKS=1;")
sql("INSERT INTO professores (nome,email,senha,admin) VALUES ('Coordenadora','coord@teste.local','x',1)")
tok = lambda js: subprocess.run(["node", "-e", f"const j=require('./api/utils/jwt');console.log({js})"], cwd=BACKEND, capture_output=True, text=True, env=os.environ).stdout.strip()
TOKEN_COORD = tok("j.gerarTokenProfessor({id:1,nome:'Coordenadora',email:'coord@teste.local',admin:1})")

env = {**os.environ, "PORT": str(PORT), "IMPORTACAO_TEMP_DIR": tempfile.mkdtemp()}
srv = subprocess.Popen(["node", "server.js"], cwd=BACKEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(40):
    try: urllib.request.urlopen(BASE + "/index.html", timeout=1); break
    except Exception: time.sleep(0.5)

SWAL_STUB = "window.Swal={fire:async(o)=>({isConfirmed:true}),};"


def novo_contexto(p, **kw):
    ctx = p.chromium.launch().new_context(**kw)
    ctx.route("**/sweetalert2*", lambda r: r.fulfill(body=SWAL_STUB, content_type="application/javascript"))
    ctx.route("**/tabler-icons*", lambda r: r.fulfill(body="", content_type="text/css"))
    ctx.route("**/font-awesome*", lambda r: r.fulfill(body="", content_type="text/css"))
    ctx.route("**/fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
    return ctx


try:
    with sync_playwright() as p:
        # ------------------------------------------------------------ login: animações
        print("LOGIN")
        ctx = novo_contexto(p, viewport={"width": 1280, "height": 800}); pg = ctx.new_page()
        pg.goto(BASE + "/index.html")
        cont = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('.container')); return [s.animationName, s.animationDuration]; })()")
        checar(cont[0] == "login-entrada" and cont[1] == "0.9s", f"container tem entrada lenta de 900 ms ({cont})")
        btn = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('#btnEntrarProfessor')); return s.transitionDuration; })()")
        checar("0.2s" in btn, f"botão tem transição rápida de 200 ms ({btn})")
        checar(float(cont[1][:-1]) > 3 * 0.2, "entrada do container é perceptivelmente mais lenta que a do botão")
        pg.wait_for_timeout(1100)
        pg.hover("#btnEntrarProfessor"); pg.wait_for_timeout(350)
        tr = pg.evaluate("getComputedStyle(document.querySelector('#btnEntrarProfessor')).transform")
        checar(tr.startswith("matrix") and tr.endswith(", -2)"), f"hover eleva o botão 2 px ({tr})")
        pg.focus("#email") if pg.query_selector("#email") else None
        pg.screenshot(path=f"{SHOTS}/login.png")
        # cadastrar/trocar painel continua funcionando
        pg.click("#register"); pg.wait_for_timeout(600)
        checar("active" in pg.get_attribute("#container", "class"), "troca para 'Turmas' continua funcionando")
        # reduced motion
        ctx2 = novo_contexto(p, reduced_motion="reduce"); pg2 = ctx2.new_page(); pg2.goto(BASE + "/index.html")
        rm = pg2.evaluate("getComputedStyle(document.querySelector('.container')).animationName")
        checar(rm == "none", f"prefers-reduced-motion remove a animação de entrada ({rm})")
        ctx2.close()
        # mobile
        ctxm = novo_contexto(p, viewport={"width": 375, "height": 740}); pm = ctxm.new_page(); pm.goto(BASE + "/index.html"); pm.wait_for_timeout(1100)
        checar(pm.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "login sem rolagem horizontal no celular (375 px)")
        pm.screenshot(path=f"{SHOTS}/login_mobile.png"); ctxm.close(); ctx.close()

        # ------------------------------------------------------------ painel: fluxo real
        print("PAINEL DA COORDENADORA")
        ctx = novo_contexto(p, viewport={"width": 1366, "height": 900}); ctx.add_init_script(f"localStorage.setItem('token', '{TOKEN_COORD}')")
        pg = ctx.new_page(); erros_js = []
        pg.on("pageerror", lambda e: erros_js.append(str(e)))
        pg.goto(BASE + "/pages/coordenador/coordenador-horarios.html")
        pg.wait_for_timeout(600)
        checar(pg.is_hidden("#hz-ambiente"), "sem aviso de ambiente quando o servidor está pronto")
        checar(pg.is_disabled("#btn-ler"), "botão 'Ler PDF' começa desabilitado")
        pg.set_input_files("#arquivo-pdf", PDF)
        checar(not pg.is_disabled("#btn-ler") and "horario_tarde.pdf" in pg.inner_text("#hz-drop-titulo"), "selecionar o arquivo habilita o botão e mostra o nome")
        pg.click("#btn-ler")
        pg.wait_for_selector("#hz-progresso:not([hidden])", timeout=10000)
        checar(pg.is_disabled("#btn-ler") and "carregando" in pg.get_attribute("#btn-ler", "class"), "botão fica desabilitado/carregando durante o envio")
        pg.wait_for_selector("#card-conferencia:not([hidden])", timeout=200000)
        tiles = pg.eval_on_selector_all(".hz-tile", "els => els.map(e => e.innerText.replace(/\\n/g,'|'))")
        print("   resumo:", tiles)
        checar(tiles[0].startswith("2|") and tiles[1].startswith("60|"), "pré-visualização mostra 2 turmas e 60 aulas")
        checar(pg.eval_on_selector("#card-conferencia", "e => !e.hidden") and "ativa" in pg.get_attribute('.hz-etapa[data-etapa=conferencia]', 'class'), "etapa 'Conferência' fica ativa")
        checar(pg.is_disabled("#btn-importar"), "importar fica BLOQUEADO enquanto há pendências")
        checar("pendência" in pg.inner_text("#hz-pendencias"), "pendências listadas na tela")
        pg.screenshot(path=f"{SHOTS}/conferencia.png", full_page=True)
        # tentar importar pelo botão desabilitado não faz nada
        n_antes = sql("SELECT COUNT(*) FROM aulas"); checar(n_antes == "0", "nada foi gravado só por ler o PDF")
        # resolver: abrir cada turma, marcar conferidas, horários conferidos, e autorizar criar turmas
        pg.check("#opt-criar-turmas")
        for i in range(2):
            pg.locator(".hz-turma > summary").nth(i).click()
            pg.get_by_role("button", name="Marcar todas as aulas desta turma como conferidas").nth(0).click() if i == 0 else None
        # segunda turma: depois do re-render, abrir e marcar
        pg.locator(".hz-turma").nth(1).evaluate("d => d.open = true")
        pg.locator(".hz-turma").nth(1).get_by_role("button", name="Marcar todas as aulas desta turma como conferidas").click()
        for i in range(2):
            cb = pg.locator(".hz-turma").nth(i).locator(".hz-horarios .hz-check input")
            if cb.count():
                pg.locator(".hz-turma").nth(i).evaluate("d => d.open = true"); cb.check()
        checar(pg.locator(".hz-turma").nth(0).locator(".hz-horarios .hz-check input").is_checked(), "checkbox 'conferi os horários' permanece marcado após re-renderizar (bug corrigido)")
        pg.wait_for_timeout(300)
        checar(not pg.is_disabled("#btn-importar") and "Tudo conferido" in pg.inner_text("#hz-pendencias"), "depois de conferir tudo, importar é liberado")
        # editar uma aula pelo modal
        pg.locator(".hz-turma").nth(0).evaluate("d => d.open = true")
        pg.locator(".hz-cel.aula").first.click()
        checar(pg.is_visible("#hz-modal.aberto"), "clicar numa aula abre o modal de edição")
        anim = pg.evaluate("getComputedStyle(document.querySelector('.hz-modal')).animationName")
        checar(anim == "anim-modal", f"modal abre com animação suave ({anim})")
        pg.fill("#hz-campo-materia", "Geografia (editada)"); pg.click("#hz-modal-salvar"); pg.wait_for_timeout(200)
        checar("Geografia (editada)" in pg.inner_text("#aba-turmas"), "edição aparece na grade")
        pg.click(".hz-aba[data-aba=professores]")
        checar(pg.locator("#aba-professores tbody tr").count() > 10, "aba Professores lista os nomes lidos")
        pg.screenshot(path=f"{SHOTS}/professores.png", full_page=True)
        pg.click(".hz-aba[data-aba=turmas]")
        pg.click("#btn-importar")
        pg.wait_for_selector("#card-resultado:not([hidden])", timeout=30000)
        checar("Importação concluída" in pg.inner_text("#card-resultado"), "mensagem de sucesso só aparece depois da gravação")
        checar(sql("SELECT COUNT(*) FROM aulas") == "60", "banco tem 60 aulas gravadas")
        checar(sql("SELECT COUNT(*) FROM aulas WHERE materia LIKE '%(editada)%'") == "1", "a edição da coordenadora foi gravada")
        checar(sql("SELECT COUNT(*) FROM turmas") == "2" and "Código" in pg.inner_text("#card-resultado"), "turmas criadas e códigos de acesso exibidos")
        pg.screenshot(path=f"{SHOTS}/resultado.png", full_page=True)
        # consulta
        pg.select_option("#hc-alvo", index=1); pg.wait_for_selector(".hc-grade", timeout=10000)
        checar(pg.locator(".hc-aula").count() == 30, "consulta mostra as 30 aulas da turma gravada")
        pg.screenshot(path=f"{SHOTS}/consulta.png", full_page=True)
        hist = pg.inner_text("#hz-historico")
        checar("Concluída" in hist, "histórico mostra a importação concluída")
        checar(not erros_js, f"sem erros de JavaScript na página {erros_js[:2]}")
        # mobile
        pm = novo_contexto(p, viewport={"width": 375, "height": 800}); pm.add_init_script(f"localStorage.setItem('token', '{TOKEN_COORD}')")
        m = pm.new_page(); m.goto(BASE + "/pages/coordenador/coordenador-horarios.html"); m.wait_for_timeout(500)
        checar(m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "painel sem rolagem horizontal no celular")
        m.screenshot(path=f"{SHOTS}/painel_mobile.png", full_page=True)
        # reduced motion no painel
        rctx = novo_contexto(p, reduced_motion="reduce"); rctx.add_init_script(f"localStorage.setItem('token', '{TOKEN_COORD}')")
        r = rctx.new_page(); r.goto(BASE + "/pages/coordenador/coordenador-horarios.html"); r.wait_for_timeout(300)
        d = r.evaluate("parseFloat(getComputedStyle(document.querySelector('#card-envio')).animationDuration)")
        checar(d < 0.01, f"painel respeita movimento reduzido (duração {d}s)")

        # aviso quando o servidor NÃO está pronto (Python/biblioteca/Tesseract faltando)
        actx = novo_contexto(p); actx.add_init_script(f"localStorage.setItem('token', '{TOKEN_COORD}')")
        actx.route("**/importacoes/ambiente", lambda r: r.fulfill(content_type="application/json", body=json.dumps({"python": "3.12.0", "problemas": [{"codigo": "DEPENDENCIA_AUSENTE", "mensagem": 'Falta a biblioteca Python "cv2". Rode: python -m pip install -r backend/python/requirements.txt'}]})))
        ap = actx.new_page(); ap.goto(BASE + "/pages/coordenador/coordenador-horarios.html"); ap.wait_for_selector("#hz-ambiente:not([hidden])", timeout=5000)
        checar('"cv2"' in ap.inner_text("#hz-ambiente") and "pip install" in ap.inner_text("#hz-ambiente"), "aviso explica o que falta instalar, antes de enviar o PDF")
        ap.screenshot(path=f"{SHOTS}/aviso_ambiente.png"); actx.close()

        # ------------------------------------------------------------ XSS armazenado
        print("SEGURANÇA DA EXIBIÇÃO")
        sql("INSERT INTO aulas (turma_id,dia_semana,hora_inicio,hora_fim,materia) VALUES (1,'sabado','07:00','07:50','<img src=x onerror=window.__xss=1>Aula')")
        sql("INSERT INTO professores (nome,email,senha,admin) VALUES ('<svg onload=window.__xss=2>',NULL,NULL,0)")
        sql("INSERT INTO aulas_professores (aula_id,professor_id) SELECT a.id,p.id FROM aulas a, professores p WHERE a.materia LIKE '<img%' AND p.nome LIKE '<svg%'")
        pg.select_option("#hc-tipo", "turma"); pg.wait_for_timeout(600); pg.select_option("#hc-alvo", "1"); pg.wait_for_selector(".hc-grade"); pg.wait_for_timeout(400)
        checar(pg.evaluate("window.__xss === undefined") and pg.locator(".hc-grade img, .hc-grade svg").count() == 0, "HTML malicioso no banco é exibido como texto, sem executar")
        checar("<img src=x" in pg.inner_text(".hc-grade"), "o texto literal aparece (escapado)")
        # aluno
        tok_aluno = tok("j.gerarTokenTurma({id:1,nome:'x',ano:1,turno:'vespertino'})")
        ca = novo_contexto(p, viewport={"width": 1280, "height": 800}); ca.add_init_script(f"localStorage.setItem('token', '{tok_aluno}')")
        a = ca.new_page(); a.goto(BASE + "/pages/aluno/aluno-horarios.html"); a.wait_for_selector(".hc-grade", timeout=10000)
        checar(a.locator(".hc-aula").count() >= 30, "aluno vê o horário da própria turma")
        a.screenshot(path=f"{SHOTS}/aluno.png", full_page=True)
finally:
    srv.terminate()

print(f"\n{ok} verificações OK, {len(falhas)} falha(s)")
for f in falhas: print(" -", f)
sys.exit(1 if falhas else 0)
