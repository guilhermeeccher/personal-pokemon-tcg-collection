import { describe, expect, it } from "vitest";

import { pedidoDeEnvio, pedidoDeRemocao, rotaDaImagemLocal } from "./imagem-local";

const BASE = { cartaId: "swsh4.5-SV001", idiomaCatalogo: "pt" as const, setId: "swsh4.5", arquivo: null, link: "" };

describe("rotaDaImagemLocal", () => {
  it("é da ficha do catálogo e escapa o id", () => {
    expect(rotaDaImagemLocal("a b/c", "en")).toBe("/api/imagens-locais/a%20b%2Fc/en");
  });
});

describe("pedidoDeEnvio", () => {
  it("arquivo: multipart com o campo arquivo", () => {
    const arquivo = new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" });
    const r = pedidoDeEnvio("arquivo", { ...BASE, arquivo });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pedido.url).toBe("/api/imagens-locais/swsh4.5-SV001/pt");
    expect(r.pedido.init.method).toBe("POST");
    expect(r.pedido.init.body).toBeInstanceOf(FormData);
    expect((r.pedido.init.body as FormData).get("arquivo")).toBeInstanceOf(File);
  });

  it("link: multipart com o campo url, aparado", () => {
    const r = pedidoDeEnvio("link", { ...BASE, link: "  https://exemplo.invalid/x.png " });
    expect(r.ok && (r.pedido.init.body as FormData).get("url")).toBe("https://exemplo.invalid/x.png");
  });

  it("mypcards: JSON com o set dado por quem chama", () => {
    const r = pedidoDeEnvio("mypcards", { ...BASE, link: "https://exemplo.invalid/a.jpg" });
    expect(r.ok && r.pedido).toEqual({
      url: "/api/sets-mypcards",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setId: "swsh4.5", url: "https://exemplo.invalid/a.jpg" }),
      },
    });
  });

  it("diz o que falta antes de enviar", () => {
    expect(pedidoDeEnvio("arquivo", BASE)).toEqual({ ok: false, falta: "erroEscolhaArquivo" });
    expect(pedidoDeEnvio("link", { ...BASE, link: "  " })).toEqual({ ok: false, falta: "erroColeLink" });
    expect(pedidoDeEnvio("mypcards", BASE)).toEqual({ ok: false, falta: "erroColeMypcards" });
    expect(pedidoDeEnvio("mypcards", { ...BASE, setId: null, link: "x" })).toEqual({ ok: false, falta: "semSet" });
  });
});

describe("pedidoDeRemocao", () => {
  it("DELETE na rota da ficha", () => {
    expect(pedidoDeRemocao("tst-001", "jp")).toEqual({ url: "/api/imagens-locais/tst-001/jp", init: { method: "DELETE" } });
  });
});
