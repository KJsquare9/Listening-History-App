# Project Report: Music Listening Analysis Tool

## Introduction

Music listening history is usually treated as a plain activity log: a list of songs, artists, times, and durations. When I started this project, I was interested in whether that same history could be treated as something more expressive. A person's listening choices are not a perfect window into their emotions, but they can still show patterns. People often use music to regulate mood, maintain energy, process stress, focus, or just stay in a certain emotional space. That made listening history feel like a useful data source to explore.

The core idea of this project is to convert listening sessions into emotional maps. Instead of only showing what songs were played, the app asks a slightly different question: what emotional path did the session move through?

To do that, I used the valence-arousal model. I chose it because it is simple enough to visualize clearly, but still more flexible than basic mood labels like "happy" or "sad." Valence represents emotional positivity or negativity. Arousal represents energy or emotional intensity. With those two values, each song can be placed on a two-dimensional emotional plane. A session then becomes a sequence of points and transitions through that plane.

The final system has two main modes. Standard mode is for analyzing one listening session at a time. Researcher Mode is for comparing multiple participants, filtering by metadata, and exploring group-level emotional patterns. I built both around the same basic pipeline, but Researcher Mode needed more careful state handling and analytical controls because the data is more complex.

## System Overview

The system follows a pipeline that turns raw listening files into visual emotional analysis:

Input file -> metadata extraction -> track matching -> emotional attribute enrichment -> session reconstruction -> metric computation -> visualization rendering

The input file is the user's listening history. This can come from Spotify, YouTube Music, or a generic CSV/TSV file. The first job is to extract the basic event metadata: track name, artist, timestamp, and listening duration. These fields are normalized into one common event format so the rest of the system does not have to care which platform the file came from.

After that, each listening event is matched against an internal song dataset. This dataset stores emotional and musical attributes for known tracks, including valence and arousal. When a match is found, those emotional attributes are attached to the listening event. If a match is not found, the event is still kept, but it is marked as unmatched.

Once the events are enriched, the app reconstructs the listening session chronologically. The ordering matters because the project is not only about the average emotional tone of a session. It is also about how the listener moved from one emotional state to another. A session that gradually moves from low-arousal music into high-arousal music says something different from a session that jumps back and forth.

The final stage is visualization. The frontend renders charts that show trajectory, time progression, duration, reference comparisons, and, in Researcher Mode, participant-level comparisons and metadata distributions. The goal is not to hide the data behind one score. I wanted the user to be able to inspect patterns from different angles.

## Input Data And Session Reconstruction

The app accepts several listening history formats because real listening data is messy. Spotify exports, YouTube Music history files, and generic CSV/TSV files all describe similar behavior, but they do not always use the same field names. For example, one file might call a timestamp `endTime`, while another calls it `timestamp`. One format might use `trackName`, while another uses `track`.

The system extracts four main pieces of information:

- track name
- artist name
- timestamp
- milliseconds played

The timestamp is especially important because it lets the app rebuild the listening order. Without timestamps, the app could still count songs, but it could not show emotional movement. The duration is also useful because a track played for three seconds should not be interpreted the same way as a track played almost fully.

During reconstruction, timestamps are parsed into a consistent format. Events are then treated as a session ordered through time. This is what allows the trajectory and time-series charts to work. The app is not just plotting a pile of songs; it is plotting a sequence.

Incomplete or unmatched tracks are handled carefully. If a row is missing a usable track, artist, or timestamp, it cannot become a meaningful event and is skipped by the parser. If the track exists as a listening event but does not match the internal song dataset, it remains in the session as unmatched. I made that choice because deleting unmatched songs would make the app look more confident than it really is. The match rate is shown to the user because it affects how much trust they should place in the emotional charts.

I also added filtering for very short listens relative to estimated track duration. This helped avoid treating skipped tracks as full emotional listening choices. It is still a simplification, but it makes the analysis less noisy.

## Valence-Arousal Mapping

The emotional mapping is based on two dimensions: valence and arousal.

Valence is the emotional positivity of a song. Higher valence usually means the song feels brighter, happier, or more positive. Lower valence can mean sadder, darker, more tense, or more negative emotional content.

Arousal is the level of energy or intensity. A high-arousal song might be loud, fast, energetic, angry, or exciting. A low-arousal song might be calm, slow, quiet, or reflective.

These two dimensions are useful because songs do not fit neatly into one emotional category. A song can be sad and calm. Another can be sad but intense. A song can be positive but relaxed, or positive and energetic. Valence and arousal let those differences show up visually.

In this project, emotional attributes come from an internal song dataset. The app does not analyze raw audio directly, and it does not call an external API during analysis. Instead, it matches listening history tracks to known tracks in the internal table. When a match is found, the song's valence and arousal values are attached to the event.

The values are scaled from 0 to 1. On the visualization, valence is the x-axis and arousal is the y-axis. This means every matched song becomes a coordinate. For example, a song with valence 0.80 and arousal 0.70 appears in the upper-right region. A song with valence 0.25 and arousal 0.30 appears lower and more to the left.

There are assumptions here. A song's emotional label is not the same as the listener's personal feeling. A generally upbeat song might feel sad to someone because of memory or context. Also, metadata matching can fail when song titles are written differently across platforms. I added text normalization to reduce obvious matching failures, but the system still depends on the quality of the song dataset.

## Visualization Design

The main visualization is the valence-arousal trajectory plot. I chose this because averages alone are too flat. If a session starts with calm low-valence songs, moves into brighter music, and then ends with intense tracks, a single average would hide that movement. The trajectory chart shows the emotional path.

Each point is a matched track. The line between points represents a transition from one track's emotional coordinate to the next. This makes emotional drift visible. A compact cluster suggests consistency. A long zigzag path suggests more volatility. Loops can show a listener returning to similar emotional regions.

The time-series chart shows valence and arousal across play order. This chart exists because the trajectory plot is good for emotional geography, but it can become dense. The time-series view makes it easier to see when valence rises, when arousal drops, or when there is a sudden emotional spike.

The duration chart ranks tracks by listening time. I included it because not every play event carries the same weight. A song played for a few seconds might be a skip, while a song played for several minutes probably represents a stronger choice. The duration chart also remains useful for unmatched tracks, since listening time can be shown even when emotional attributes are missing.

The reference comparison chart places the user's session against synthetic high-depression and low-depression reference groups. This is not a diagnostic comparison. It is a way to contextualize emotional distribution and movement. The chart helps show whether a session clusters near one reference profile, spreads across both, or looks different from either.

In Researcher Mode, I added distribution visualizations for participant metadata. Numeric fields are normalized so fields with different scales can be compared visually. Categorical fields are shown as counts. This helps connect listening behavior with participant-level variables without forcing everything into one chart.

## Researcher Mode

Researcher Mode is the part of the app built for multi-participant analysis. Standard mode is designed around one listener or one session. Researcher Mode is different because it has to support comparison across people, metadata filtering, and group-level exploration.

The input format is a folder-style dataset. It includes a metadata CSV with a required `Participant_ID` column, plus one listening history file per participant. The participant IDs in the metadata must match the listening file names. This keeps the system explicit. I did not want the app guessing which listening file belongs to which participant.

Researcher Mode provides several advanced controls:

- participant selection
- metadata field selection
- valence range filtering
- arousal range filtering
- metadata distribution views
- aggregate research summary cards
- multi-participant trajectory comparison
- volatility indicators

The participant selection controls decide which listeners are included in the analysis. Each participant displays match coverage, so the researcher can immediately see whether that participant has enough usable emotional data. This became important during testing because some demo participants had very few matched songs. If the interface simply hid that, the researcher could misread the results.

The metadata field controls let the researcher compare participant variables such as age, gender, depression score, music engagement, or therapy duration. Numeric fields are treated differently from categorical fields. Numeric fields get distribution bars and simple min/mean/max summaries. Categorical fields get count bars. This made the metadata analysis more meaningful than just listing values.

The emotional range filter lets the researcher focus on a region of the valence-arousal space. For example, they can inspect only high-arousal songs, or only songs with lower valence. This acts like emotional segmentation. It lets the user ask questions like, "Which participants have enough matched tracks in this emotional region?" or "How does the trajectory change if I focus only on high-energy listening?"

I also added volatility as an exploratory measure. It is calculated as the average step distance between consecutive matched tracks in valence-arousal space. A higher value means the participant's listening path jumps around more emotionally. A lower value means the path is more consistent. This is not a clinical statistic, but it is useful for comparing emotional movement between participants.

Researcher Mode was also where most of the frontend debugging happened. The first version had several unreliable behaviors. CSV listening files were accidentally excluded even though they were supposed to be supported. Metadata parsing was too fragile. Selected fields could carry over from an old dataset into a new dataset. If all participants were unchecked, the interface silently showed everyone again. Some participants disappeared from the trajectory without explanation if they had too few matched tracks.

Fixing this meant cleaning up the state flow. The current version keeps one clear source of truth: loaded participant data, selected participants, selected metadata fields, and emotional range filters. Loading a new dataset resets analysis state. Filters update charts immediately. Empty states are explicit. Participants with too little matched data are reported instead of silently ignored.

The main design challenge was making Researcher Mode powerful without making it feel like a debugging console. Advanced controls can easily become cluttered. I kept the layout in sections: upload, configure analysis, results, and trajectory view. This makes the workflow feel more like exploration than setup work.

## Frontend Design And User Experience

The app uses a dark atmospheric visual style because the project is about emotional interpretation. A plain white dashboard felt too clinical and disconnected from the music theme. The darker background also helps the chart colors stand out, especially the valence-arousal paths.

I tried to make the visual hierarchy chart-centered. The upload and summary cards are important, but the main result is the visualization. In standard mode, the trajectory chart is the centerpiece. In Researcher Mode, the participant controls and metadata distributions support the trajectory instead of replacing it.

The interface uses glass-like panels, soft borders, and restrained neon accents. I wanted it to feel modern and slightly experimental, but not like a sci-fi mockup. During the design pass I reduced some visual competition between cards and made the chart area more dominant. This helped the app feel more like a polished product demo rather than a collection of separate prototype panels.

Interaction design also mattered. Tabs need clear active states. Upload feedback needs to tell the user what is happening. Disabled states need to look intentional. Researcher Mode especially needs stable interactions because researchers may toggle filters repeatedly while exploring patterns. If the charts lag, duplicate, or show stale data, the analysis becomes hard to trust.

## Challenges Faced

One of the biggest challenges was inconsistent metadata. Different platforms use different field names, and even CSV files can vary depending on who exports or edits them. I handled this by normalizing the parsed event structure. That way the rest of the system only sees one consistent shape.

Track matching was another challenge. Real song titles are messy. They include punctuation, featured artists, parentheses, alternate spellings, and sometimes different artist names across platforms. I added text normalization and a fallback matching strategy, but this is still one of the system's limitations.

Visualization scaling also took work. A trajectory with a few songs is easy to draw. A trajectory with many songs can become dense quickly. The time-series and duration charts help by showing different views of the same data. In Researcher Mode, the challenge is even bigger because multiple participants can overlap. I added participant legends, clearer empty states, and range filtering to make the chart more manageable.

Frontend state was probably the most frustrating part of Researcher Mode. It is easy to make a checkbox update one chart, but harder to make sure every metric, distribution, and trajectory updates together when the dataset changes. I had to fix stale filters, reset behavior, empty selections, and repeated rendering. This made me appreciate how much of data visualization work is really state management.

Another challenge was balancing aesthetics with usability. The dark visual identity works well for the project, but small labels and subtle controls can become hard to read. I adjusted spacing, hierarchy, and contrast so the interface still feels atmospheric but remains usable.

## Limitations

The most important limitation is that emotional mapping is based on stored song attributes, not direct measurement of the listener's actual feelings. Valence and arousal describe the music, not necessarily the person's internal state.

The project also depends on the internal song dataset. If a track is missing, it cannot be emotionally mapped. If a song's stored value is inaccurate or too general, the visualization inherits that limitation.

The reference groups and researcher demo data are synthetic. They are useful for demonstrating comparison workflows, but they should not be interpreted as real psychological evidence. A real research deployment would need validated datasets, participant consent, stronger statistical methods, and careful ethical review.

Another limitation is that the system currently uses fairly simple metrics. Average valence, average arousal, match rate, duration, and volatility are useful, but they are not the full story. Emotional clustering, session segmentation, and personalized baselines would make the analysis richer.

## Future Improvements

One future improvement would be real-time or streaming support. Instead of uploading an exported file, the app could analyze a listening session as it happens. That would make the emotional trajectory feel more immediate.

Another improvement would be richer emotional embeddings. Valence and arousal are useful, but they simplify music emotion into two dimensions. A future version could include additional dimensions like tension, dominance, nostalgia, or lyrical sentiment.

Clustering would also be useful. The app could automatically identify emotional zones within a session, such as calm-positive clusters or high-arousal negative clusters. This would help summarize long listening histories.

Personalized baselines would make the analysis more meaningful. Instead of comparing every user to the same emotional scale, the system could learn what is normal for a specific listener and then show deviations from that baseline.

For Researcher Mode, I would add more advanced cohort workflows. Researchers could define groups based on metadata filters, compare group-level trajectories, export summary statistics, and analyze changes over longer periods. Longitudinal listening analysis would be especially interesting because emotional listening patterns may change over weeks or months.

Machine learning could also be used to estimate emotional attributes for unmatched tracks, but I would treat that carefully. It could improve coverage, but it would also introduce uncertainty. Any predicted values should be labeled as estimated rather than treated like known data.

## Conclusion

This project turns music listening history into an emotional analysis tool. It starts with ordinary listening metadata, matches songs to valence-arousal attributes, reconstructs the session over time, computes interpretable summaries, and renders visualizations that show emotional movement.

The most interesting part of the project was realizing that the order of songs matters as much as the songs themselves. Averages are useful, but they do not show how a session unfolds. The trajectory view, time series, and Researcher Mode comparisons make the listening history feel more like a behavioral pattern than a static playlist.

Building the system also taught me that visualization is not just about drawing charts. It is about deciding what the data means, preserving uncertainty, handling messy inputs, and making sure the interface does not mislead the user. Researcher Mode made that especially clear because multi-participant analysis breaks quickly if state and filtering are not handled carefully.

Overall, the app shows one way listening history can become psychologically meaningful without pretending to be a diagnostic system. It gives users and researchers a structured way to explore emotional patterns in music listening, while still making the assumptions and limitations visible.
