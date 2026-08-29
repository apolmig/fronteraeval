# External evaluation discovery

FronteraEval automatically imports new tasks and distributed-register entries from Inspect Evals. Evaluations published elsewhere need a different treatment: automated discovery can surface them, but it cannot establish authorship, construct validity, duplication status, or suitability for the public catalogue.

The weekly external-discovery workflow therefore creates a **review queue**, not catalogue entries.

## Sources

The scanner checks recent:

- GitHub repositories matching evaluation and benchmark queries;
- repositories updated by known evaluation organisations;
- arXiv papers matching AI-evaluation and benchmark queries;
- Hugging Face benchmark datasets.

## Inclusion in the queue

Candidates must combine an evaluation or benchmark signal with an AI-system signal and meet a conservative relevance threshold. Known catalogue URLs and near-duplicate titles are excluded. Generic tutorials, course lists, and prompt collections are filtered out.

## Human gate

A candidate can enter the public catalogue only after checking:

1. original developer or research authors;
2. paper, project page, dataset, and reference implementation;
3. exact construct and unit of analysis;
4. protocol, scoring, elicitation, tools, and model-system assumptions;
5. duplication or family relationship with existing records;
6. record type and topic classification;
7. what the evidence can and cannot establish.

Set `review_status` to `accepted` or `dismissed` to prevent a candidate from reappearing. The queue is operational metadata, not an endorsement or public evaluation assessment.
