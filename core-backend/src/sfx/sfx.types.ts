/** Represents a single sound-effect entry from the sfx_library table. */
export interface SfxEntry {
  id: string;
  name: string;
  tags: string[] | null;
  s3Url: string;
  durationS: string | null;
  license: string | null;
  createdAt: Date | null;
}
