/** Matches Templates multi-upload progress text (1/N). */
export function sequentialUploadProgressLabel(
  oneBasedIndex: number,
  total: number,
  fileName: string
): string {
  return `Uploading ${oneBasedIndex}/${total}: ${fileName}`;
}
