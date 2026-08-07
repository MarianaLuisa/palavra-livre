import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_TOTAL_WORDS } from "./config";
import { formatDate } from "./format";

export type ShareInput = {
  championshipDate: string;
  championshipFinished: boolean;
  position: number | null;
  totalScore: number;
  wordsSolved: number;
  totalWords?: number;
};

/**
 * Texto de compartilhamento.
 * Enquanto o campeonato estiver em andamento nao expomos pontuacao,
 * palavras descobertas nem colocacao: so o fato de estar participando.
 */
export function createChampionshipShareText(input: ShareInput): string {
  const totalWords = input.totalWords ?? CHAMPIONSHIP_TOTAL_WORDS;
  const header = `${CHAMPIONSHIP_BRAND.name} do Palavra Livre - ${formatDate(input.championshipDate)}`;

  if (!input.championshipFinished) {
    return `${header}\nEstou participando do ${CHAMPIONSHIP_BRAND.eventLabel} de hoje. Resultados são divulgados no encerramento.`;
  }

  const positionText =
    input.position === null ? "Participei" : `Fiquei em ${input.position}º lugar`;

  return `${header}\n${positionText} com ${input.totalScore.toLocaleString("pt-BR")} pontos e ${input.wordsSolved} de ${totalWords} palavras descobertas.`;
}

export async function shareChampionshipResult(text: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator === "undefined") {
    return "failed";
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch {
      // Cancelou ou nao suportado: tenta a area de transferencia.
    }
  }

  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
