import sqlite3
import os
import json

db_path = os.path.join(os.getcwd(), "..", "nexus_media_vortex.db")

def migrate_neuron_buster():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get the first user
    cursor.execute("SELECT id FROM users LIMIT 1")
    user = cursor.fetchone()
    
    if not user:
        print("No users found in database.")
        conn.close()
        return
        
    user_id = user[0]
    
    # Check if neuron_buster already exists
    cursor.execute("SELECT id FROM channels WHERE channel_key = 'neuron_buster'")
    if cursor.fetchone():
        print("Neuron Buster channel already exists.")
        conn.close()
        return

    # Insert Neuron Buster
    print(f"Assigning 'neuron_buster' to user ID {user_id}...")
    
    api_keys = json.dumps({
        "gemini": "",
        "pexels": "",
        "tts": ""
    })
    
    cursor.execute("""
        INSERT INTO channels 
        (user_id, channel_key, name, niche, target_audience, topic_prompt, script_prompt, visual_prompt, metadata_prompt, cta_template, hashtags_template, api_keys_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        "neuron_buster",
        "Neuron Buster",
        "Science, psychology, and mind-blowing facts",
        "Curious individuals, young adults, teens",
        "Generate a topic about a bizarre but true psychological phenomenon or a mind-blowing space fact.",
        "Write a highly engaging, fast-paced 150 word script explaining this phenomenon. Start with a hook.",
        "For each sentence, describe a photorealistic, intriguing visual that relates to the sentence.",
        "Write a catchy TikTok/YouTube Shorts caption and 5 relevant hashtags.",
        "Like and subscribe to bust your neurons!",
        "#science #facts #psychology #mindblown #neuronbuster",
        api_keys
    ))
    
    conn.commit()
    conn.close()
    print("Successfully added Neuron Buster channel.")

if __name__ == "__main__":
    migrate_neuron_buster()
