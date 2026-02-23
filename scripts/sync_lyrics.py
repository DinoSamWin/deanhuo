import os
import whisper
import warnings
import difflib

warnings.filterwarnings('ignore')

def similar(a, b):
    if not a or not b: return 0
    return difflib.SequenceMatcher(None, a, b).ratio()

def generate_lrc():
    print("Loading Whisper model (base)...")
    model = whisper.load_model("base")

    audio_dir = "assets/audio"
    lyrics_dir = "assets/lyrics"

    if not os.path.exists(lyrics_dir):
        os.makedirs(lyrics_dir)

    for filename in os.listdir(audio_dir):
        if filename.endswith(".mp3"):
            audio_path = os.path.join(audio_dir, filename)
            base_name = os.path.splitext(filename)[0]
            lrc_path = os.path.join(lyrics_dir, f"{base_name}.lrc")
            md_path = os.path.join(lyrics_dir, f"{base_name}.md")

            if not os.path.exists(md_path):
                print(f"Skipping {filename}, no original .md lyrics found.")
                continue

            print(f"Processing {filename} to get raw timestamps...")
            result = model.transcribe(
                audio_path, 
                initial_prompt="这是一首中文歌曲的歌词，请用简体中文转录",
                fp16=False
            )
            
            with open(md_path, "r", encoding="utf-8") as f:
                original_lines = [line.strip() for line in f if line.strip() and not line.startswith('#')]

            whisper_segments = result["segments"]
            
            if not whisper_segments or not original_lines:
                continue

            n = len(original_lines)
            m = len(whisper_segments)
            
            # dp[i][j] = max score matching first i original lines with first j whisper segments
            dp = [[0.0] * (m + 1) for _ in range(n + 1)]
            
            for i in range(1, n + 1):
                for j in range(1, m + 1):
                    score_match = dp[i-1][j-1] + similar(original_lines[i-1], whisper_segments[j-1]["text"].strip())
                    score_skip_orig = dp[i-1][j]
                    score_skip_whisp = dp[i][j-1]
                    dp[i][j] = max(score_match, score_skip_orig, score_skip_whisp)
                    
            # Backtrack
            i, j = n, m
            mapping = {}
            while i > 0 and j > 0:
                score_match = dp[i-1][j-1] + similar(original_lines[i-1], whisper_segments[j-1]["text"].strip())
                if round(dp[i][j], 5) == round(score_match, 5):
                    mapping[i-1] = j-1
                    i -= 1
                    j -= 1
                elif round(dp[i][j], 5) == round(dp[i-1][j], 5):
                    i -= 1
                else:
                    j -= 1
                    
            # mapping[i] = the whisper segment assigned to original line i
            timestamps = [None] * n
            for idx in range(n):
                if idx in mapping:
                    timestamps[idx] = whisper_segments[mapping[idx]]["start"]
                    
            print(f"DEBUG {filename} Original timestamps: {timestamps[:10]}")
            # Pre-pass: Force strictly increasing timestamps by nullifying duplicates/regressions
            last_valid = -1.0
            for idx in range(n):
                if timestamps[idx] is not None:
                    if timestamps[idx] <= last_valid + 0.1:
                        timestamps[idx] = None  # Force interpolation
                    else:
                        last_valid = timestamps[idx]
            print(f"DEBUG {filename} After pre-pass: {timestamps[:10]}")

            # Interpolate missing timestamps smoothly
            last_t = 0.0
            
            for idx in range(n):
                # If timestamp exists, we accept it as our baseline
                if timestamps[idx] is not None:
                    last_t = timestamps[idx]
                else:
                    # Look ahead to see where the next known timestamp is
                    next_idx = idx + 1
                    next_t = None
                    while next_idx < n:
                        if timestamps[next_idx] is not None:
                            next_t = timestamps[next_idx]
                            break
                        next_idx += 1
                        
                    if next_t is not None:
                        # calculate incremental time per gap
                        gap = next_idx - idx + 1
                        timestamps[idx] = last_t + (max(0.5, next_t - last_t) / gap)
                    else:
                        # Append fixed time 3.0s interval
                        timestamps[idx] = last_t + 3.0
                    last_t = timestamps[idx]
            
            # Post-pass: ensure strictly monotonically increasing array
            current_min = -0.1
            for idx in range(n):
                if timestamps[idx] <= current_min:
                    timestamps[idx] = current_min + 0.1
                current_min = timestamps[idx]
                
            print(f"DEBUG {filename} After Interpolation: {timestamps[:10]}")

            # Output pure mapped LRC using the user's original words
            with open(lrc_path, "w", encoding="utf-8") as f:
                for idx, text in enumerate(original_lines):
                    start = timestamps[idx]
                    minutes = int(start // 60)
                    seconds = start % 60
                    f.write(f"[{minutes:02d}:{seconds:05.2f}] {text}\n")
                    
            print(f"Successfully generated {lrc_path} (Forced Alignment)")

if __name__ == "__main__":
    generate_lrc()
