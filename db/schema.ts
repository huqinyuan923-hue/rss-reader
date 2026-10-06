import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const feeds = pgTable(
  "feeds",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    siteUrl: text("site_url").notNull().default(""),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastError: text("last_error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("feeds_created_at_idx").on(t.createdAt)]
);

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    guid: text("guid").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    author: text("author").notNull().default(""),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("articles_feed_guid_idx").on(t.feedId, t.guid),
    index("articles_feed_published_idx").on(t.feedId, t.publishedAt),
  ]
);

export const feedsRelations = relations(feeds, ({ many }) => ({
  articles: many(articles),
}));
export const articlesRelations = relations(articles, ({ one }) => ({
  feed: one(feeds, { fields: [articles.feedId], references: [feeds.id] }),
}));

export type Feed = typeof feeds.$inferSelect;
export type Article = typeof articles.$inferSelect;
