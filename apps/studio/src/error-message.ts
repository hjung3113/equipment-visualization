export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '알 수 없는 오류';
