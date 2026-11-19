import copy, unittest
from furnished_concept import generate_concepts,validate_plan
class ConceptTests(unittest.TestCase):
 def brief(self,**kwargs):return dict(width=12,length=20,wallHeight=2.8,preference='social',**kwargs)
 def test_boundaries(self):
  for w in [12,16,20]:
   for l in [16,23,30]:
    for preference in ['social','private']:
     for p in generate_concepts(dict(width=w,length=l,wallHeight=2.8,preference=preference)):
      self.assertTrue(p['validation']['nonOverlapPassed']);self.assertFalse(p['validation']['constructionApproved'])
      self.assertEqual(len(p['furniture']),14)
      kinds={f['kind'] for f in p['furniture']};self.assertTrue({'sofa','bed','counter','dining-table','coffee-table'}<=kinds)
 def test_distinct_topologies(self):
  a,b=generate_concepts(self.brief());ca=next(r for r in a['rooms'] if r['id']=='corridor');cb=next(r for r in b['rooms'] if r['id']=='corridor')
  self.assertEqual(ca['w'],1.4);self.assertEqual(cb['h'],1.4);self.assertNotEqual(a['entrySide'],b['entrySide'])
  self.assertNotEqual([(r['id'],r['x'],r['y']) for r in a['rooms']],[(r['id'],r['x'],r['y']) for r in b['rooms']])
 def test_preference_changes_geometry(self):
  a=self.brief();b={**a,'preference':'private'}
  for social,private in zip(generate_concepts(a),generate_concepts(b)):
   s=next(r for r in social['rooms'] if r['id']=='living');p=next(r for r in private['rooms'] if r['id']=='living')
   self.assertGreater(s['w']*s['h'],p['w']*p['h']);self.assertNotEqual(social['preferencesApplied'],private['preferencesApplied'])
 def test_invalid_briefs(self):
  for change in [{'width':True},{'length':float('nan')},{'wallHeight':float('inf')},{'width':11.99},{'length':30.1},{'preference':'daylight'},{'rooms':3},{'preference':[]}]:
   with self.assertRaises(ValueError):generate_concepts({**self.brief(),**change})
  with self.assertRaises(ValueError):generate_concepts({})
 def test_reject_bad_footprints(self):
  p=generate_concepts(self.brief())[0]
  for change in [{'x':-1},{'w':float('nan')},{'w':0}]:
   changed=copy.deepcopy(p);changed['furniture'][0].update(change)
   with self.assertRaises(ValueError):validate_plan(changed)
  changed=copy.deepcopy(p);changed['furniture'][1].update({k:changed['furniture'][0][k] for k in ['x','y','w','h']})
  with self.assertRaises(ValueError):validate_plan(changed)
 def test_clearance_concerns_are_not_hidden(self):
  p=generate_concepts(self.brief())[0];r=next(r for r in p['rooms'] if r['id']=='study');o=next(o for o in p['openings'] if o['id']=='door-study')
  f=next(f for f in p['furniture'] if f['roomId']=='study');f.update(x=r['x']+.05,y=sum([o['a'][1],o['b'][1]])/2-.2,w=.4,h=.4)
  report=validate_plan(p);self.assertTrue(any(c['kind']=='opening_clearance_concern' and c['furnitureId']==f['id'] for c in report['concerns']))
if __name__=='__main__':unittest.main()
