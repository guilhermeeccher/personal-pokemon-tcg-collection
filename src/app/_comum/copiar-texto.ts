/**
 * Copiar para a área de transferência **numa app servida por HTTP puro**.
 *
 * ## Por que não é só `navigator.clipboard`
 *
 * A Clipboard API só existe em *secure context*: HTTPS ou `localhost`. A
 * instalação padrão desta app é servida por HTTP puro na rede local, sem TLS
 * (decisão de stack, `AGENTS.md`), e quem usa abre pelo IP da máquina, não
 * por `localhost`. Quem publica por túnel com o acesso por senha chega por
 * HTTPS, mas o código tem de funcionar na instalação padrão. Nesse endereço `navigator.clipboard` é **`undefined`**, e
 * `navigator.clipboard.writeText(...)` estoura um `TypeError` antes de tentar
 * copiar coisa nenhuma.
 *
 * Foi exatamente o que aconteceu com o botão "Copiar" das listas de compra em
 * 2026-09-16: funcionava em `localhost` no servidor e não funcionava na tela
 * de quem abria pelo IP. A lição vale além deste arquivo — **qualquer API
 * de browser marcada como "secure context only" está fora de alcance na
 * instalação padrão, que é HTTP na rede local.**
 *
 * ## O caminho que funciona
 *
 * `document.execCommand("copy")` sobre uma seleção. Está deprecado e continua
 * implementado em todos os navegadores atuais, justamente porque é o único
 * caminho em contexto não seguro. A Clipboard API é tentada primeiro quando
 * existe; o `execCommand` é a queda.
 *
 * O `<textarea>` temporário fica fora da tela mas **precisa estar no
 * documento e ser focável** — `display:none` ou `visibility:hidden` fazem a
 * seleção falhar em silêncio. Daí o posicionamento fora da viewport em vez de
 * escondê-lo.
 */

export async function copiarTexto(texto: string): Promise<boolean> {
  // Caminho bom, quando o contexto permite. O `?.` não é enfeite: em HTTP o
  // objeto inteiro é undefined, não só o método.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Permissão negada ou documento sem foco. Cai para o execCommand.
    }
  }

  if (typeof document === "undefined") return false;

  const area = document.createElement("textarea");
  area.value = texto;
  // Fora da viewport, mas renderizado: escondido de verdade não é selecionável.
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.left = "-1000px";
  area.style.opacity = "0";

  document.body.appendChild(area);
  try {
    area.focus();
    area.select();
    // iOS ignora `select()` sozinho; o intervalo explícito é o que funciona lá.
    area.setSelectionRange(0, texto.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}
