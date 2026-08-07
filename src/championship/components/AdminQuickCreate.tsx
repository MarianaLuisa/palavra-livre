import { useState } from "react";
import { useAuth } from "../../account/AuthProvider";
import { Link } from "../../router/router";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES } from "../config";
import { getErrorMessage } from "../errors";
import { formatDate } from "../format";
import { getChampionshipService } from "../service";

type AdminQuickCreateProps = {
  /** Recarrega o estado do campeonato depois de criar. */
  onCreated: () => void;
  /** Texto de apoio, que muda conforme a situação da tela. */
  hint?: string;
};

/**
 * Atalho para a administração criar o campeonato do dia sem sair da tela
 * do campeonato.
 *
 * Só aparece para quem é administrador. Isso é ergonomia, não segurança:
 * a autorização de verdade está em cd_admin_create_championship, que
 * chama cd_require_admin() e confere auth.uid() contra championship_admins.
 * Um usuário comum que dispare a RPC pelo console recebe FORBIDDEN.
 *
 * O sorteio das 13 palavras continua acontecendo no servidor.
 */
export function AdminQuickCreate({ onCreated, hint }: AdminQuickCreateProps) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Quem não é administrador nem vê esta seção.
  if (!auth.isAdmin) {
    return null;
  }

  async function handleCreate() {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);
    setFeedback(null);

    try {
      // Procura a proxima data livre no servidor. Um campeonato encerrado
      // continua ocupando o dia, entao criar "para hoje" as cegas colidiria
      // com a restricao de um campeonato oficial por data.
      const result = await getChampionshipService().createNextChampionship();

      setFeedback(
        result.isToday
          ? "Campeonato de hoje criado, com as 13 palavras sorteadas."
          : `Hoje já tinha campeonato. Criado para ${formatDate(result.championshipDate)}.`,
      );
      onCreated();
    } catch (caughtError) {
      console.error("[admin] falha ao criar o campeonato do dia", caughtError);
      setError(getErrorMessage(caughtError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-quick-create" aria-labelledby="admin-quick-create-title">
      <header>
        <span className="tag-chip official">Administração</span>
        <h2 id="admin-quick-create-title">Criar {CHAMPIONSHIP_BRAND.eventLabel}</h2>
      </header>

      <p className="admin-section-hint">
        {hint ??
          "Cria na próxima data livre, com as quatro modalidades e as 13 palavras sorteadas no servidor."}
      </p>

      {error !== null ? (
        <p className="panel-error" role="alert">
          {error}
        </p>
      ) : null}
      {feedback !== null ? (
        <p className="admin-feedback" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="panel-actions wrap">
        <button
          className="primary-button"
          type="button"
          onClick={() => void handleCreate()}
          disabled={busy}
        >
          {busy ? "Criando..." : "Criar próximo campeonato"}
        </button>
        <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.admin}>
          Abrir painel completo
        </Link>
      </div>
    </section>
  );
}
