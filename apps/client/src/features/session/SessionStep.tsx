import PrimaryActionButton from '../../ui/PrimaryActionButton'
import type { SessionStepState } from '../../state/appReducer'
import type { SessionStepEvent, UserRole } from '@romance/shared'

type SessionStepProps = {
  step: SessionStepState
  choices: SessionStepEvent['choices']
  isMyTurn: boolean
  userRole: UserRole
  onChoice?: (choiceId: string) => void
}

const SessionStep = ({ step, choices, isMyTurn, userRole, onChoice }: SessionStepProps) => {
  // Показывать bubble только если это шаг для моей роли (т.е. сообщение от партнера ко мне)
  const shouldShowBubble =
    (userRole === 'MALE' && step.actor.name === 'He') ||
    (userRole === 'FEMALE' && step.actor.name === 'She')

  return (
    <div className="session-step">
      {step.bubbleText && shouldShowBubble && (
        <div className="session-step__bubble">
          <div className="session-step__actor">
            {userRole === 'MALE' ? 'Она' : 'Он'}
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
