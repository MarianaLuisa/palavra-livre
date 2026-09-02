import { Component, type ErrorInfo, type ReactNode } from "react";
import { CHAMPIONSHIP_BRAND, CHAMPIONSHIP_ROUTES } from "../config";
import { Link } from "../../router/router";

type Props = {
  children: ReactNode;
  onReset?: () => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ChampionshipErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ChampionshipErrorBoundary] Erro capturado na partida:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <section className="championship-panel" aria-labelledby="error-title" style={{ maxWidth: "48rem", margin: "2rem auto" }}>
          <header className="panel-header">
            <h1 id="error-title">Ops! Ocorreu um problema na rodada</h1>
            <p className="panel-subtitle">{CHAMPIONSHIP_BRAND.name}</p>
          </header>

          <div className="panel-notice" style={{ borderLeft: "4px solid #ef4444" }}>
            <p>
              Não se preocupe: seu progresso e pontuação do dia estão seguros no servidor.
            </p>
            {this.state.error?.message ? (
              <p style={{ fontSize: "0.875rem", opacity: 0.8, marginTop: "0.5rem" }}>
                Detalhe: {this.state.error.message}
              </p>
            ) : null}
          </div>

          <div className="panel-actions wrap" style={{ marginTop: "1.5rem" }}>
            <button className="primary-button" type="button" onClick={this.handleRetry}>
              Recarregar Partida
            </button>
            <Link className="secondary-button" to={CHAMPIONSHIP_ROUTES.championship}>
              Voltar ao {CHAMPIONSHIP_BRAND.eventLabel}
            </Link>
            <Link className="ghost-button" to={CHAMPIONSHIP_ROUTES.freePlay}>
              Jogar Jogo Livre
            </Link>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
