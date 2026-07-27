#!/usr/bin/env python3

import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize_article_schema import normalize_html


SCRIPT_RE = re.compile(
    r"<script\b[^>]*\btype=[\"']application/ld\+json[\"'][^>]*>"
    r"(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


def json_ld_roots(html: str) -> list[object]:
    return [json.loads(raw.strip()) for raw in SCRIPT_RE.findall(html)]


def walk(value: object):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def nodes_of_type(html: str, schema_type: str) -> list[dict]:
    return [
        node
        for root in json_ld_roots(html)
        for node in walk(root)
        if isinstance(node, dict) and node.get("@type") == schema_type
    ]


class NormalizeArticleSchemaTests(unittest.TestCase):
    def test_merges_duplicate_article_into_injected_block(self):
        html = """
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Article",
           "headline":"Original","datePublished":"2026-04-17"}
        </script>
        <script data-outilsia-author-block type="application/ld+json">
          {"@context":"https://schema.org","@type":"BlogPosting",
           "headline":"Injected","dateModified":"2026-07-08",
           "author":{"@type":"Person","name":"Chris"}}
        </script>
        """
        normalized, result = normalize_html(html)

        articles = nodes_of_type(normalized, "Article")
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0]["headline"], "Injected")
        self.assertEqual(articles[0]["datePublished"], "2026-04-17")
        self.assertEqual(articles[0]["author"]["name"], "Chris")
        self.assertEqual(result["removed_blocks"], 1)

    def test_preserves_dataset_and_faq_inside_graph(self):
        html = """
        <script type="application/ld+json">
          {"@context":"https://schema.org","@graph":[
            {"@type":"BlogPosting","headline":"Study",
             "datePublished":"2026-05-27"},
            {"@type":"Dataset","name":"Measured games"},
            {"@type":"FAQPage","mainEntity":[]}
          ]}
        </script>
        <script data-outilsia-author-block type="application/ld+json">
          {"@context":"https://schema.org","@type":"BlogPosting",
           "headline":"Study","dateModified":"2026-07-08"}
        </script>
        """
        normalized, _ = normalize_html(html)

        self.assertEqual(len(nodes_of_type(normalized, "BlogPosting")), 1)
        self.assertEqual(len(nodes_of_type(normalized, "Dataset")), 1)
        self.assertEqual(len(nodes_of_type(normalized, "FAQPage")), 1)
        article = nodes_of_type(normalized, "BlogPosting")[0]
        self.assertEqual(article["datePublished"], "2026-05-27")

    def test_removes_unproven_mass_modified_date(self):
        html = """
        <script data-outilsia-author-block type="application/ld+json">
          {"@context":"https://schema.org","@type":"BlogPosting",
           "headline":"Page","datePublished":"2026-04-22",
           "dateModified":"2026-07-08"}
        </script>
        """
        normalized, result = normalize_html(html)

        article = nodes_of_type(normalized, "BlogPosting")[0]
        self.assertNotIn("dateModified", article)
        self.assertTrue(result["removed_mass_date"])

    def test_applies_verified_date_override(self):
        html = """
        <script data-outilsia-author-block type="application/ld+json">
          {"@context":"https://schema.org","@type":"BlogPosting",
           "headline":"Page","dateModified":"2026-07-08"}
        </script>
        """
        normalized, result = normalize_html(
            html,
            date_override={
                "datePublished": "2026-04-22",
                "dateModified": "2026-05-01",
            },
        )

        article = nodes_of_type(normalized, "BlogPosting")[0]
        self.assertEqual(article["datePublished"], "2026-04-22")
        self.assertEqual(article["dateModified"], "2026-05-01")
        self.assertTrue(result["date_override_applied"])

    def test_is_idempotent(self):
        html = """
        <script type="application/ld+json">
          {"@context":"https://schema.org","@type":"Article",
           "headline":"Page","datePublished":"2026-04-17"}
        </script>
        <script data-outilsia-author-block type="application/ld+json">
          {"@context":"https://schema.org","@type":"BlogPosting",
           "headline":"Page","dateModified":"2026-07-08"}
        </script>
        """
        first, _ = normalize_html(html)
        second, result = normalize_html(first)

        self.assertEqual(first, second)
        self.assertFalse(result["changed"])


if __name__ == "__main__":
    unittest.main()
