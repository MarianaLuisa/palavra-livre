import type { MouseEvent } from "react";

type RulesModalProps = {
  open: boolean;
  onClose: () => void;
};

export function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          x
        </button>
        <p className="eyebrow">Como jogar</p>
        <h2 id="rules-title">Regras</h2>
        <div className="rules-list">
          <p>Digite uma palavra de 5 letras por rodada.</p>
          <p>A mesma tentativa vale para todos os tabuleiros ativos.</p>
          <p>Acentos sao ignorados, e c cedilha vale como c.</p>
          <div className="rule-swatch">
            <span className="tile correct">A</span>
            <p>Letra certa na posicao certa.</p>
          </div>
          <div className="rule-swatch">
            <span className="tile present">A</span>
            <p>Letra existe, mas em outra posicao.</p>
          </div>
          <div className="rule-swatch">
            <span className="tile absent">A</span>
            <p>Letra nao aparece na palavra.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
