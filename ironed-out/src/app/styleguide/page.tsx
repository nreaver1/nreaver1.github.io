import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StyleguideDemo } from './StyleguideDemo';

export const metadata: Metadata = { title: 'Styleguide', robots: { index: false } };

/** Dev-only gallery of the base components, for checking the hand-drawn look at phone width. */
export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <StyleguideDemo />;
}
