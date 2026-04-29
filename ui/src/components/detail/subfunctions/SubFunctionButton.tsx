/**
 * Button/scene/script action button.
 */

interface SubFunctionButtonProps {
  label: string;
  onPress: () => void;
}

export function SubFunctionButton({ label, onPress }: SubFunctionButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      className="cursor-pointer rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600 active:scale-95 dark:bg-blue-600 dark:hover:bg-blue-700"
    >
      {label}
    </button>
  );
}
