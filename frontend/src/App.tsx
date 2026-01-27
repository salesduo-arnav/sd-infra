import { useState, useEffect } from 'react';
import './App.css';
import { fetchItems, createItem } from './api';
import type { Item } from './api';

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      const data = await fetchItems();
      setItems(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to connect to backend. Is it running?');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    try {
      const createdItem = await createItem(newItemName);
      setItems([...items, createdItem]);
      setNewItemName('');
    } catch (err) {
      console.error(err);
      setError('Failed to create item');
    }
  };

  return (
    <div className="container">
      <h1>Item Manager</h1>

      {error && <div className="error-message">{error}</div>}

      <form onSubmit={handleSubmit} className="form-group">
        <input
          type="text"
          value={newItemName}
          onChange={(e) => setNewItemName(e.target.value)}
          placeholder="Enter item name..."
        />
        <button type="submit">Add Item</button>
      </form>

      <ul className="item-list">
        {items.length === 0 ? (
          <p style={{ color: '#888' }}>No items found. Add one above!</p>
        ) : (
          items.map((item) => (
            <li key={item.id} className="item-card">
              <span className="item-name">{item.name}</span>
              <span className="item-id">#{item.id}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default App;
