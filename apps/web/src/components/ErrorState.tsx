interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong.", onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="alert">
      <div className="text-3xl mb-2" aria-hidden="true">⚠️</div>
      <p className="text-red-600 font-medium">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 min-h-[44px] min-w-[44px]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
