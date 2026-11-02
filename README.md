# Assistent-Creator-Short.

Fábrica de Shorts do canal de edits cúbicos (mundo de blocos, personagens originais, trilha original).
Uma sessão agendada do Claude produz e agenda 1 vídeo por dia no YouTube via Metricool.

- `ROTINA.md`: passo a passo que a sessão diária segue (tema → roteiro → trilha → QA → render → hospedagem → agendamento → registro).
- `CANAL.md`: estratégia do canal (formato, duração, horário, títulos, regras de monetização, banco de ideias).
- `REGISTRO.md`: todos os episódios já feitos (para nunca repetir história nem trilha).
- `kit/`: motor voxel em JavaScript (@napi-rs/canvas), sintetizador da trilha em Python e scripts de render.
- `episodios/`: história e trilha de cada episódio, para servir de modelo aos próximos.
- Branch `videos`: hospedagem temporária do MP4 do dia (link raw que o Metricool baixa).
