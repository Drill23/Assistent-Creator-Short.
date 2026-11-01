# Rotina diária: 1 edit cúbico por dia no YouTube do Adriano

Esta é a receita que a sessão agendada segue todo dia. Ela roda sozinha, sem ninguém para aprovar nada no meio.
Siga na ordem. Se algum passo falhar de um jeito que não dá para contornar, NÃO poste nada: termine explicando o que travou.

Dados fixos:
- Repositório: este (`Drill23/Assistent-Creator-Short.`), branch de trabalho `canal-cubico`.
- Metricool: brand/blogId `7354166`, fuso `America/Sao_Paulo`, rede `youtube` (canal `UCrTovNbCRGwBuZDBxx_Ji9Q`).
- Horário de postagem: **16:00 (Brasília)**, o pico do público em todos os dias da semana segundo o Metricool.
- O vídeo é hospedado na branch órfã `videos` deste repositório (público) e passado ao Metricool pelo link raw.

## 0. Preparar
```bash
cd <repo> && git fetch origin canal-cubico && git checkout canal-cubico && git pull origin canal-cubico
bash kit/setup.sh /tmp/ep            # copia o kit, instala @napi-rs/canvas, numpy/scipy/pillow e as fontes Poppins
```
Leia `CANAL.md` (estratégia) e `REGISTRO.md` (tudo o que já foi feito). Se a skill `edit-cubico` estiver disponível,
ela tem a referência completa da API do kit e das técnicas; ESTA rotina tem prioridade sobre ela nestes pontos:
o kit vem de `kit/` (não do artifact), o registro é `REGISTRO.md` (não a memória), não se faz pergunta ao Adriano,
e o render usa `render4.sh` (4 processos).

## 1. Já tem vídeo hoje?
Chame `getScheduledPosts` (brandId 7354166, de hoje 00:00 até hoje 23:59, fuso America/Sao_Paulo).
Se já houver um post de YouTube agendado para hoje, pare aqui sem fazer nada e diga isso no final. (Evita postagem dupla.)

## 2. Escolher o tema sozinho
- Nunca repetir premissa, chefão, bioma ou gancho do `REGISTRO.md`. Evitar os temas antigos listados lá.
- Se o episódio mais recente tem "Parte 2: pendente" e já faz 2+ dias, pode fazer a Parte 2 (no máximo 1 parte 2 a cada 3 vídeos).
- Variar: alternar biomas (neve, deserto, lava, oceano, céu, vazio, floresta, cavernas, noite) e tipos de chefão
  (golem, serpente, criatura montada com `E.pushBox`: aranha, kraken, fênix, nave, etc.). Ideias em `CANAL.md`.

## 3. Roteiro na batida
- 140–165 BPM inédito no registro, 14–18 compassos, alvo **22–30 s** (duração = compassos × 4 × 60/BPM).
- Estrutura: gancho (flash-forward congelado + pergunta forte já no quadro 0) → montagem rápida do mundo → drop 1
  (revelação do herói, proeza) → pausa curta com virada → drop 2 (chefão, perseguição, "NÃO HOJE.", golpe final em
  câmera lenta) → final curto com pergunta/CTA e glitch que emenda no quadro 0 (loop).
- A história tem que se entender SEM som e SEM narração: legendas curtas em CAIXA ALTA contam tudo.
- Herói e chefão sempre originais (nada de personagens, nomes ou logos de jogos; não escrever "Minecraft" no vídeo).

## 4. Construir
- Comece copiando o episódio mais recente de `episodios/` (história + trilha) para `/tmp/ep` e reescreva:
  mundo, paletas, lugares-chave, coreografia, explosões, cenas, FX e legendas.
- Trilha NOVA para cada vídeo (ver regras da skill: BPM, tônica+modo e progressão inéditos; trocar pelo menos 3 de 5:
  timbre do lead, groove, baixo, pad/textura, som-assinatura). O script de música deve gravar `kicks_<slug>.json` e a
  história deve ler esse arquivo para os zoom-punch seguirem os bumbos reais (veja `episodios/ep_titan`).
- Conferir a trilha pelos números (RMS por compasso: drops > pausa; pico ≤ 0,95; duração igual à do vídeo).

## 5. QA visual (máximo 2 rodadas de correção)
```bash
cd /tmp/ep && python3 music_<slug>.py music_<slug>.json music.wav      # gera kicks_<slug>.json
mkdir -p qa && SP=qa node story_<slug>.js still <20-30 tempos cobrindo todas as cenas>
python3 sheet.py qa_sheet.jpg qa/f_*.jpg                                 # olhar com Read
```
Checklist: herói visível (não atrás de morro/árvore), câmera fora do terreno, chefão enquadrado, legenda legível e sem
cobrir o rosto, quadro 0 sem flash, cenas claras não estouradas (bloom 0,2–0,3 em neve/dia), cores do bioma corretas.

## 6. Render
```bash
cd /tmp/ep && bash render4.sh story_<slug>.js music_<slug>.py music_<slug>.json Edit_<Slug> 4
ffprobe -v error -show_entries format=duration -of csv=p=0 Edit_<Slug>.mp4
ffmpeg -y -loglevel error -i Edit_<Slug>.mp4 -vf "fps=1.2,scale=216:384,tile=8x4" -frames:v 1 final_sheet.jpg   # olhar com Read
```

## 7. Hospedar o vídeo (branch órfã `videos`)
```bash
V=$(mktemp -d) && cd "$V" && git init -q && git checkout -q -b videos
git remote add origin "$(git -C <repo> remote get-url origin)"
cp /tmp/ep/Edit_<Slug>.mp4 . && git add . && git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -qm "video: <título>"
git push -f origin videos
URL="https://raw.githubusercontent.com/Drill23/Assistent-Creator-Short./videos/Edit_<Slug>.mp4"
curl -sI "$URL" | head -3            # precisa dar 200 e content-length do tamanho do arquivo
```
(Branch só de hospedagem: não abrir PR para ela. O Metricool copia o arquivo para o servidor dele no momento do
agendamento (o post passa a apontar para static.metricool.com), então substituir o vídeo no dia seguinte não afeta nada.)

## 8. Agendar no Metricool
`createScheduledPost` com blogId `7354166`, `date` = hoje 16:00 -03:00 (se já passou das 15:30, use amanhã 16:00) e `info`:
```json
{
  "autoPublish": true, "draft": false, "descendants": [], "firstCommentText": "", "hasNotReadNotes": false,
  "media": ["<URL raw do passo 7>"], "mediaAltText": [], "shortener": false, "smartLinkData": {"ids": []},
  "providers": [{"network": "youtube"}],
  "publicationDate": {"dateTime": "AAAA-MM-DDT16:00:00", "timezone": "America/Sao_Paulo"},
  "text": "<descrição: 2 linhas + pergunta para comentários + hashtags>",
  "youtubeData": {"title": "<título ≤ 60 caracteres>", "type": "short", "privacy": "public",
                  "tags": ["shorts", "animação", "mundo de blocos", "..."], "category": "FILM_ANIMATION",
                  "madeForKids": false, "isAiGeneratedContent": false}
}
```
- `madeForKids` é SEMPRE false (decisão do Adriano: conteúdo para público geral, monetização normal).
- `isAiGeneratedContent` false: é animação estilizada, não conteúdo realista.
- Depois confira com `getScheduledPosts` que o post aparece para o horário certo.

## 9. Registrar e salvar
- Acrescente a linha do episódio no final de `REGISTRO.md` (mesmo formato das anteriores, com data de criação e de postagem).
- Copie `story_<slug>.js`, `music_<slug>.py` e `music_<slug>.json` para `episodios/ep_<slug>/`.
- Se mudou algo do kit que serve para todos (correção de bug, helper novo), atualize `kit/` também.
- `git add -A && git commit` (mensagem: "EPxx: <título>") e `git push -u origin canal-cubico`.

## 10. Mensagem final (vai como notificação para o Adriano)
Curta, em português: título agendado e horário, 1 frase sobre a história, 1 frase sobre a trilha, o link do planner do
Metricool que a ferramenta devolveu e um aviso de que a trilha é sintetizada e não foi ouvida por ninguém.
Se algo deu errado, diga exatamente o que e em que passo.
