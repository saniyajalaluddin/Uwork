# SkillQuest V1 product specification

## Product thesis

SkillQuest turns difficult, verified coding practice into a daily habit. It does not pay people for being online; it recognizes demonstrated reasoning, correct work, and sustained learning.

## V1 scope

| Area | Include now | Explicitly defer |
| --- | --- | --- |
| Platform | Responsive web app, PWA-ready | Native iOS/Android apps |
| Practice | Original single-language coding and reasoning challenges | Imported or copied third-party questions |
| Modes | Learn, Interview, Level Up | Social feed and leaderboards |
| Rewards | SQ balance, capped challenge rewards, mock redemption | Cash withdrawal and referrals |
| Pro | Advanced tracks, analytics, hints, notes, ad-free experience | Point multipliers |
| Browsing | Curated focus-room learning links | Full browser engine, tabs, history, extensions |

## Core user flow

1. A learner chooses an intent and receives a calibrated challenge.
2. The app creates a server-side attempt with an expiry and an evaluation token.
3. The learner submits an explanation, answer, or code.
4. An evaluator checks hidden tests and/or rubric criteria.
5. The rewards service writes one immutable SQ ledger event for a passing result.
6. The learner sees feedback, topic mastery signals, and a next best task.

## Initial data model

```text
users(id, country, plan, created_at)
skills(id, name, parent_skill_id)
challenges(id, skill_id, mode, difficulty, reward_cap, status)
attempts(id, user_id, challenge_id, issued_at, expires_at, submission_hash, status)
evaluations(id, attempt_id, evaluator_version, score, feedback, evaluated_at)
point_ledger(id, user_id, attempt_id, amount, reason, created_at)
risk_events(id, user_id, attempt_id, type, severity, created_at)
```

The ledger must enforce a unique `attempt_id` for reward events. A user’s balance is calculated from ledger rows; it is not a number editable by the browser.

## Success criteria for a closed beta

- At least 30 invited Indian learners complete three verified tasks each.
- At least 35% return in the following week.
- More than 70% of passing attempts receive feedback users rate as useful.
- Fewer than 2% of award attempts require fraud review.
- No cash redemption is enabled until the reward, compliance, and support paths are proven.
