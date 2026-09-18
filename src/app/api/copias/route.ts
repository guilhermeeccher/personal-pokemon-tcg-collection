import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import {
  inserirCopia,
  listarCopias,
  listarRaridadesDoInventario,
  listarSetsDoInventario,
  obterVariantesDisponiveisDaCarta,
} from "@/lib/db/consultas";
import { validarCriacaoCopia } from "@/lib/dominio/copia";
import { validarFiltrosInventario } from "@/lib/dominio/filtros-inventario";
import { validarVariantesContraCatalogo } from "@/lib/dominio/variantes-catalogo";

/**
 * GET /api/copias — inventário com busca e filtros combináveis (spec §5
 * Fase 1). Devolve também os valores disponíveis para popular os selects
 * de filtro (`opcoes`), já que dependem do que existe de fato no
 * inventário (não faz sentido oferecer filtro por um set em que não há
 * nenhuma carta cadastrada).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resultado = validarFiltrosInventario({
    set: url.searchParams.get("set"),
    idioma: url.searchParams.get("idioma"),
    raridade: url.searchParams.get("raridade"),
    variante: url.searchParams.get("variante"),
    condicao: url.searchParams.get("condicao"),
    graded: url.searchParams.get("graded"),
    localizacao: url.searchParams.get("localizacao"),
    alocacao: url.searchParams.get("alocacao"),
    semImagem: url.searchParams.get("semImagem"),
    q: url.searchParams.get("q"),
    pagina: url.searchParams.get("pagina"),
    tamanhoPagina: url.searchParams.get("tamanhoPagina"),
  });

  if (!resultado.ok) {
    return NextResponse.json({ erro: "Filtros inválidos.", detalhes: resultado.erros }, { status: 400 });
  }

  const [{ itens, total }, setsDisponiveis, raridadesDisponiveis] = await Promise.all([
    listarCopias(db, resultado.filtros),
    listarSetsDoInventario(db),
    listarRaridadesDoInventario(db),
  ]);

  return NextResponse.json({
    itens,
    total,
    pagina: resultado.filtros.pagina,
    tamanhoPagina: resultado.filtros.tamanhoPagina,
    opcoes: { sets: setsDisponiveis, raridades: raridadesDisponiveis },
  });
}

/** POST /api/copias — cria uma cópia avulsa (cadastro por busca). */
export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido (JSON esperado)." }, { status: 400 });
  }

  const resultado = validarCriacaoCopia(corpo as Record<string, unknown>);
  if (!resultado.ok) {
    return NextResponse.json({ erro: "Cópia inválida.", detalhes: resultado.erros }, { status: 400 });
  }

  // Mesma restrição do cadastro por set (mesma decisão): a
  // variante escolhida precisa existir no catálogo para esta carta.
  const disponiveis = await obterVariantesDisponiveisDaCarta(
    db,
    resultado.copia.cartaId,
    resultado.copia.idiomaCatalogo,
  );
  const errosVariante = validarVariantesContraCatalogo(
    [{ cartaId: resultado.copia.cartaId, variante: resultado.copia.variante }],
    disponiveis ? { [resultado.copia.cartaId]: disponiveis } : {},
  );
  if (errosVariante.length > 0) {
    return NextResponse.json(
      { erro: "Variante fora do catálogo para esta carta.", detalhes: errosVariante },
      { status: 400 },
    );
  }

  try {
    const { id, fundida, quantidadeFinal } = await inserirCopia(db, resultado.copia);
    // 200 quando somou numa cópia existente, 201 quando criou registro
    // novo: o recurso criado é diferente do recurso atualizado, e a tela
    // precisa da distinção para não dizer "cadastrada" quando somou.
    return NextResponse.json(
      { id, fundida, quantidadeFinal },
      { status: fundida ? 200 : 201 },
    );
  } catch (err) {
    console.error("[POST /api/copias] falha ao inserir:", err);
    return NextResponse.json(
      { erro: "Falha ao gravar — verifique se a carta existe no catálogo informado." },
      { status: 400 },
    );
  }
}
