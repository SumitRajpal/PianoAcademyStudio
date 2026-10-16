/** The paper strip behind the staff, and its soft shadow. */
export type StaffPaperLook = {
  color: string;
  shadow: { sigma: number; color: string };
};

export const LESSON_STAFF_PAPER_LOOK: StaffPaperLook = {
  color: '#FFFFFF',
  shadow: { sigma: 15, color: 'rgba(0, 0, 0, 0.19)' },
};
