import PrimaryActionButton from '../../ui/PrimaryActionButton'
import type { SessionStepState } from '../../state/appReducer'
import type { SessionStepEvent } from '@romance/shared'

type SessionStepProps = {
  step: SessionStepState
  choices: SessionStepEvent['choices']
  isMyTurn: boolean
  onChoice?: (choiceId: string) => void
}

const SessionStep = ({ step, choices, isMyTurn, onChoice }: SessionStepProps) => {
  // bubbleText — текст выбора, сделанного партнёром на предыдущем шаге
  // Лейбл: если сейчас ход She (actor=She), значит выбор делал He → "Он", и наоборот
  const bubbleLabel = step.actor.name === 'She' ? 'Он' : 'Она'

  return (
    <div className="session-step">
      {step.bubbleText && (
        <div className="session-step__bubble">
          <div className="session-step__actor">
            {bubbleLabel}
          </div>
          <p className="session-step__text">{step.bubbleText}</p>
        </div>
      )}

      {isMyTurn ? (
        <div className="session-step__choices">
          {choices.map((choice) => (
            <PrimaryActionButton
              key={choice.id}
              onClick={() => onChoice?.(choice.id)}
            >
              {choice.text}
            </PrimaryActionButton>
          ))}
        </div>
      ) : (
        <div className="session-step__waiting">Жду ответ партнера...</div>
      )}
    </div>
  )
}

export default SessionStep
