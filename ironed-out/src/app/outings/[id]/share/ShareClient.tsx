'use client';

import { useState, useTransition } from 'react';
import { Button, ButtonLink } from '@/components/ui';
import { rotateLinkAction } from '../../actions';
import styles from './share.module.css';

export function ShareClient(props: {
  outingId: string;
  url: string;
  path: string;
  courseName: string;
  dateLabel: string;
  spots: string;
  host: string;
}) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const message = `Who's in? Grab a spot: ${props.url}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: props.courseName, text: "Who's in? Grab a spot", url: props.url });
        return;
      } catch {
        // Cancelled or unsupported: fall through to the sms: link.
      }
    }
    window.location.href = `sms:?&body=${encodeURIComponent(message)}`;
  };

  return (
    <>
      <h1 className={styles.title}>Link’s ready!</h1>
      <p style={{ fontSize: 19 }}>Drop it in the group chat. Friends tap, pick a time, done.</p>
      <div className={styles.linkRow}>
        <output className={styles.link} aria-label="Invite link">
          {props.url.replace(/^https?:\/\//, '')}
        </output>
        <Button size="sm" onClick={copy} aria-live="polite">
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      <figure className={styles.chat} aria-label="How the link looks in a group chat">
        <div className={styles.bubble}>Who’s in? Grab a spot</div>
        <div className={styles.card}>
          <div className={styles.cardArt} aria-hidden="true">
            <svg viewBox="0 0 300 70" width="100%" height="70" preserveAspectRatio="xMidYMax slice">
              <circle cx="262" cy="20" r="11" fill="#F2C14E" stroke="#2B2A26" strokeWidth="2" />
              <path
                d="M0 50 Q80 30 160 44 T300 38 L300 70 L0 70Z"
                fill="#6FA35F"
                stroke="#2B2A26"
                strokeWidth="2"
              />
              <line
                x1="200"
                y1="46"
                x2="200"
                y2="12"
                stroke="#2B2A26"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path d="M200 12 L222 19 L200 26Z" fill="#C0392B" stroke="#2B2A26" strokeWidth="2" />
            </svg>
          </div>
          <div className={styles.cardBody}>
            <div className={`display ${styles.cardTitle}`}>{props.courseName}</div>
            <div className={styles.cardMeta}>
              {props.dateLabel} · {props.spots}
            </div>
            <div className={styles.cardHost}>{props.host}</div>
          </div>
        </div>
      </figure>

      <Button variant="primary" onClick={share}>
        Text it to the group
      </Button>
      <ButtonLink href={props.path}>See the invite page</ButtonLink>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await rotateLinkAction(props.outingId);
          })
        }
      >
        Make a new link (the old one stops working)
      </Button>
    </>
  );
}
